import request from "supertest";
import { app } from "../../../express-app.js";
import { supabase } from "../../../config/supabase/config.js";
import { hasMpesaCredentials } from "../../../helpers/mpesaHelper.js";

const testAdmissionNumber = 13256;
const testPhoneNumber = "254708374149";

describe("M-Pesa API Integration Tests", () => {
  let createdMockCheckoutRequestId = null;
  let createdLiveCheckoutRequestId = "test-live-checkout-id-" + Date.now();

  beforeAll(async () => {
    // Cleanup any leftovers from prior runs
    await supabase.from("sanCodeMpesa_payments").delete().eq("adm_no", testAdmissionNumber);
  });

  afterAll(async () => {
    // Final cleanup of test records
    await supabase.from("sanCodeMpesa_payments").delete().eq("adm_no", testAdmissionNumber);
  });

  describe("POST /parents/mpesa-stkpush", () => {
    test("Successfully initiates payment session (Fallback or Live)", async () => {
      const response = await request(app)
        .post("/parents/mpesa-stkpush")
        .send({
          admNo: testAdmissionNumber,
          phoneNumber: testPhoneNumber
        })
        .expect(200);

      expect(response.body).toHaveProperty("status", "success");
      expect(response.body).toHaveProperty("checkoutRequestId");
      expect(response.body).toHaveProperty("amount", 50);
      expect(response.body).toHaveProperty("isMock");

      createdMockCheckoutRequestId = response.body.checkoutRequestId;
    });

    test("Fails when required fields are missing", async () => {
      await request(app)
        .post("/parents/mpesa-stkpush")
        .send({
          admNo: testAdmissionNumber
          // missing phoneNumber
        })
        .expect(400);
    });
  });

  describe("POST /parents/mpesa-verify", () => {
    test("Fails verification for non-existent checkout session", async () => {
      await request(app)
        .post("/parents/mpesa-verify")
        .send({
          checkoutRequestId: "non-existent-id-12345"
        })
        .expect(404);
    });

    test("Mock Payment Verification successfully updates status and returns JWT token", async () => {
      // In mock mode, the checkoutRequestId is the UUID of the inserted row
      const response = await request(app)
        .post("/parents/mpesa-verify")
        .send({
          checkoutRequestId: createdMockCheckoutRequestId,
          mpesaCode: "MOCK123456"
        })
        .expect(200);

      expect(response.body).toHaveProperty("status", "success");
      expect(response.body).toHaveProperty("token");
      expect(response.body).toHaveProperty("receipt");
      expect(response.body.payment).toHaveProperty("status", "COMPLETED");

      // Verify DB got updated
      const { data } = await supabase
        .from("sanCodeMpesa_payments")
        .select("status")
        .eq("id", createdMockCheckoutRequestId)
        .single();
      
      expect(data.status).toBe("COMPLETED");
    });
  });

  describe("POST /parents/mpesa-callback", () => {
    test("Callback updates live transaction to COMPLETED on success", async () => {
      // 1. Manually insert a live pending transaction first
      const { data: livePayment, error } = await supabase
        .from("sanCodeMpesa_payments")
        .insert([{
          adm_no: testAdmissionNumber,
          phone_number: testPhoneNumber,
          amount: 50.00,
          status: "PENDING",
          checkout_request_id: createdLiveCheckoutRequestId,
          merchant_request_id: "test-live-merchant-id-" + Date.now()
        }])
        .select()
        .single();

      expect(error).toBeNull();
      expect(livePayment).not.toBeNull();

      // 2. Simulate Callback request from Safaricom
      const callbackPayload = {
        Body: {
          stkCallback: {
            MerchantRequestID: livePayment.merchant_request_id,
            CheckoutRequestID: createdLiveCheckoutRequestId,
            ResultCode: 0,
            ResultDesc: "The service request is processed successfully.",
            CallbackMetadata: {
              Item: [
                { Name: "Amount", Value: 50.00 },
                { Name: "MpesaReceiptNumber", Value: "NL12345678" },
                { Name: "TransactionDate", Value: 20260606162343 },
                { Name: "PhoneNumber", Value: 254708374149 }
              ]
            }
          }
        }
      };

      const callbackResponse = await request(app)
        .post("/parents/mpesa-callback")
        .send(callbackPayload)
        .expect(200);

      expect(callbackResponse.body).toHaveProperty("ResultCode", 0);
      expect(callbackResponse.body).toHaveProperty("ResultDesc");

      // 3. Verify DB state is updated
      const { data: updatedPayment } = await supabase
        .from("sanCodeMpesa_payments")
        .select("*")
        .eq("checkout_request_id", createdLiveCheckoutRequestId)
        .single();

      expect(updatedPayment.status).toBe("COMPLETED");
      expect(updatedPayment.mpesa_receipt_number).toBe("NL12345678");

      // 4. Test that verification endpoint now returns token for this live transaction
      const verifyResponse = await request(app)
        .post("/parents/mpesa-verify")
        .send({
          checkoutRequestId: createdLiveCheckoutRequestId
        })
        .expect(200);

      expect(verifyResponse.body).toHaveProperty("status", "success");
      expect(verifyResponse.body).toHaveProperty("token");
      expect(verifyResponse.body).toHaveProperty("receipt", "NL12345678");
    });

    test("Callback updates transaction to FAILED on cancel/error", async () => {
      const failedCheckoutId = "failed-checkout-id-" + Date.now();

      // 1. Insert pending live transaction
      const { data: livePayment } = await supabase
        .from("sanCodeMpesa_payments")
        .insert([{
          adm_no: testAdmissionNumber,
          phone_number: testPhoneNumber,
          amount: 50.00,
          status: "PENDING",
          checkout_request_id: failedCheckoutId,
          merchant_request_id: "failed-merchant-id-" + Date.now()
        }])
        .select()
        .single();

      // 2. Simulate failed Callback request from Safaricom (ResultCode 1032 = Cancelled by user)
      const callbackPayload = {
        Body: {
          stkCallback: {
            MerchantRequestID: livePayment.merchant_request_id,
            CheckoutRequestID: failedCheckoutId,
            ResultCode: 1032,
            ResultDesc: "Request cancelled by user."
          }
        }
      };

      await request(app)
        .post("/parents/mpesa-callback")
        .send(callbackPayload)
        .expect(200);

      // 3. Verify DB state is updated to FAILED
      const { data: updatedPayment } = await supabase
        .from("sanCodeMpesa_payments")
        .select("*")
        .eq("checkout_request_id", failedCheckoutId)
        .single();

      expect(updatedPayment.status).toBe("FAILED");
      
      // 4. Test that verification endpoint returns failed
      const verifyResponse = await request(app)
        .post("/parents/mpesa-verify")
        .send({
          checkoutRequestId: failedCheckoutId
        })
        .expect(200);

      expect(verifyResponse.body).toHaveProperty("status", "failed");
    });
  });
});
