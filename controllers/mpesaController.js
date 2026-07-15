// controllers/mpesaController.js
const { supabase } = require("../config/supabase/config.js");
const jwt = require("jsonwebtoken");
const { KEYS } = require("../config/keys.js");
const { hasMpesaCredentials, sendStkPush } = require("../helpers/mpesaHelper.js");

/**
 * Initiates an STK Push to the parent's phone.
 * Triggers actual Daraja STK Push API if credentials exist, otherwise falls back to a simulated mock push.
 */
const initiateMockStkPush = async (req, res) => {
  const { admNo, phoneNumber } = req.body;

  if (!admNo || !phoneNumber) {
    return res.status(400).json({ error: "Missing required fields: admNo and phoneNumber." });
  }

  const amount = 50.00; // Approved default fee

  try {
    // Check if live Daraja integration is configured
    if (hasMpesaCredentials()) {
      console.log(`[M-PESA DARAJA] Initiating live STK push for ADM ${admNo} to ${phoneNumber}...`);
      try {
        const responseData = await sendStkPush(phoneNumber, amount, admNo);
        
        if (responseData && responseData.ResponseCode === "0") {
          // 1. Create a pending payment session in Supabase with Daraja request identifiers
          const { data: payment, error } = await supabase
            .from("sanCodeMpesa_payments")
            .insert([{
              adm_no: Number(admNo),
              phone_number: phoneNumber.trim(),
              amount: amount,
              status: "PENDING",
              merchant_request_id: responseData.MerchantRequestID,
              checkout_request_id: responseData.CheckoutRequestID
            }])
            .select()
            .single();

          if (error) throw error;

          console.log(`[M-PESA DARAJA SUCCESS] STK Push sent successfully. CheckoutRequestID: ${responseData.CheckoutRequestID}`);
          return res.status(200).json({
            status: "success",
            message: "STK push initiated successfully. Please complete the PIN prompt on your phone.",
            checkoutRequestId: responseData.CheckoutRequestID,
            amount,
            isMock: false
          });
        } else {
          console.warn("[M-PESA DARAJA] Failed initiation response. Falling back to Mock mode.");
        }
      } catch (stkErr) {
        console.error("[M-PESA DARAJA] STK push error, falling back to simulated mock push. Error:", stkErr.message);
      }
    }

    // FALLBACK: Mock simulator mode
    // 1. Create a pending payment session in Supabase without Daraja request identifiers
    const { data: payment, error } = await supabase
      .from("sanCodeMpesa_payments")
      .insert([{
        adm_no: Number(admNo),
        phone_number: phoneNumber.trim(),
        amount: amount,
        status: "PENDING"
      }])
      .select()
      .single();

    if (error) throw error;

    console.log(`\n======================================================`);
    console.log(`[M-PESA DARAJA SIMULATOR] STK Push Sent to ${phoneNumber}`);
    console.log(`Checking payment access fee for Student ADM: ${admNo}`);
    console.log(`Amount: KES ${amount.toFixed(2)}`);
    console.log(`Checkout Request ID (UUID): ${payment.id}`);
    console.log(`======================================================\n`);

    res.status(200).json({
      status: "success",
      message: "STK push query sent successfully (SIMULATOR). Please complete PIN prompt.",
      checkoutRequestId: payment.id,
      amount,
      isMock: true
    });

  } catch (err) {
    console.error("M-Pesa STK Push error:", err.message);
    res.status(500).json({ error: "Internal server error triggering payment prompt." });
  }
};

/**
 * Verifies the status of an M-Pesa payment.
 * Securely enforces server-side callback results for real transactions,
 * while allowing client-side manual confirm updates for mock transactions.
 */
const verifyMpesaPayment = async (req, res) => {
  const { checkoutRequestId, mpesaCode } = req.body;

  if (!checkoutRequestId) {
    return res.status(400).json({ error: "Missing required field: checkoutRequestId." });
  }

  try {
    // 1. Fetch current transaction state
    // To handle both generated UUIDs (mock mode) and Daraja CheckoutRequestIDs (live mode)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkoutRequestId);
    let query = supabase.from("sanCodeMpesa_payments").select("*");
    
    if (isUuid) {
      query = query.or(`checkout_request_id.eq.${checkoutRequestId},id.eq.${checkoutRequestId}`);
    } else {
      query = query.eq("checkout_request_id", checkoutRequestId);
    }

    const { data: payment, error: fetchErr } = await query.maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!payment) {
      return res.status(404).json({ error: "Payment checkout session not found." });
    }

    // 2. If the payment is completed, issue JWT
    if (payment.status === "COMPLETED") {
      console.log(`[M-PESA VERIFIED]: Payment completed for ADM ${payment.adm_no}. Receipt: ${payment.mpesa_receipt_number}`);
      
      const token = jwt.sign(
        { admNo: Number(payment.adm_no), scope: "parent_lookup", paid: true },
        KEYS.JWT_SECRET,
        { expiresIn: "1h" }
      );

      return res.status(200).json({
        status: "success",
        message: "Payment successfully verified.",
        receipt: payment.mpesa_receipt_number,
        payment,
        token
      });
    }

    if (payment.status === "FAILED") {
      return res.status(200).json({
        status: "failed",
        message: "Payment transaction failed or was cancelled."
      });
    }

    // 3. Handling pending state
    if (payment.status === "PENDING") {
      // If it is a live payment, prevent client-side bypass! Force polling client to wait for webhook.
      if (payment.checkout_request_id) {
        return res.status(200).json({
          status: "pending",
          message: "Awaiting M-Pesa payment callback confirmation. Please wait."
        });
      }

      // If it is a mock payment, allow client-side confirmation for simulator mode
      const receiptCode = mpesaCode ? mpesaCode.trim().toUpperCase() : "MOCK" + Math.floor(100000 + Math.random() * 900000).toString();
      
      const { data: updatedPayment, error: updateErr } = await supabase
        .from("sanCodeMpesa_payments")
        .update({
          status: "COMPLETED",
          mpesa_receipt_number: receiptCode
        })
        .eq("id", payment.id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      console.log(`[M-PESA SIMULATED SUCCESS]: Simulated payment completed for ADM ${updatedPayment.adm_no}. Receipt: ${receiptCode}`);

      const token = jwt.sign(
        { admNo: Number(updatedPayment.adm_no), scope: "parent_lookup", paid: true },
        KEYS.JWT_SECRET,
        { expiresIn: "1h" }
      );

      return res.status(200).json({
        status: "success",
        message: "Payment successfully verified (SIMULATOR).",
        receipt: receiptCode,
        payment: updatedPayment,
        token
      });
    }

  } catch (err) {
    console.error("Verify M-Pesa error:", err.message);
    res.status(500).json({ error: "Internal server error verifying payment." });
  }
};

/**
 * Public Webhook Web Callback handler.
 * Listens to Safaricom Daraja API callback requests.
 */
const mpesaCallback = async (req, res) => {
  try {
    const { Body } = req.body;
    if (!Body || !Body.stkCallback) {
      console.warn("[M-PESA CALLBACK] Invalid payload received:", JSON.stringify(req.body));
      return res.status(400).json({ ResultCode: 1, ResultDesc: "Invalid Payload" });
    }

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc } = Body.stkCallback;
    console.log(`[M-PESA CALLBACK] Callback received for CheckoutRequestID: ${CheckoutRequestID}. ResultCode: ${ResultCode}, ResultDesc: ${ResultDesc}`);

    if (ResultCode === 0) {
      // Payment Successful
      const metadata = Body.stkCallback.CallbackMetadata?.Item || [];
      const receiptItem = metadata.find(item => item.Name === "MpesaReceiptNumber");
      const mpesaReceiptNumber = receiptItem ? receiptItem.Value : null;

      if (!mpesaReceiptNumber) {
        console.error(`[M-PESA CALLBACK] Successful payment missing MpesaReceiptNumber. CheckoutRequestID: ${CheckoutRequestID}`);
      }

      // Update database status to COMPLETED
      const { data, error } = await supabase
        .from("sanCodeMpesa_payments")
        .update({
          status: "COMPLETED",
          mpesa_receipt_number: mpesaReceiptNumber || `REF-${CheckoutRequestID}`
        })
        .eq("checkout_request_id", CheckoutRequestID)
        .select();

      if (error) {
        console.error("[M-PESA CALLBACK] Failed to update database:", error.message);
      } else {
        console.log(`[M-PESA CALLBACK SUCCESS] Database updated to COMPLETED for CheckoutRequestID: ${CheckoutRequestID}`);
      }
    } else {
      // Payment Failed (e.g. Cancelled, Timeout, Insufficient Funds)
      console.log(`[M-PESA CALLBACK FAILED] Transaction failed for CheckoutRequestID: ${CheckoutRequestID}. Desc: ${ResultDesc}`);
      
      const { data, error } = await supabase
        .from("sanCodeMpesa_payments")
        .update({ status: "FAILED" })
        .eq("checkout_request_id", CheckoutRequestID)
        .select();

      if (error) {
        console.error("[M-PESA CALLBACK] Failed to update database on failure status:", error.message);
      }
    }

    // Must return accepted response to Safaricom
    res.status(200).json({ ResultCode: 0, ResultDesc: "Callback processed successfully." });
  } catch (err) {
    console.error("[M-PESA CALLBACK ERROR]:", err.message);
    res.status(500).json({ ResultCode: 1, ResultDesc: "Internal Server Error" });
  }
};

module.exports = {
  initiateMockStkPush,
  verifyMpesaPayment,
  mpesaCallback
};
