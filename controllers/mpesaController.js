// controllers/mpesaController.js
const { supabase } = require("../config/supabase/config.js");
const jwt = require("jsonwebtoken");
const { KEYS } = require("../config/keys.js");

/**
 * Initiates a simulated STK Push to the parent's phone.
 * Inserts a PENDING payment record.
 */
const initiateMockStkPush = async (req, res) => {
  const { admNo, phoneNumber } = req.body;

  if (!admNo || !phoneNumber) {
    return res.status(400).json({ error: "Missing required fields: admNo and phoneNumber." });
  }

  try {
    const amount = 50.00; // Approved default fee

    // 1. Create a pending payment session in Supabase
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

    // 2. Log mock push notifications to server stream
    console.log(`\n======================================================`);
    console.log(`[M-PESA DARAJA SIMULATOR] STK Push Sent to ${phoneNumber}`);
    console.log(`Checking payment access fee for Student ADM: ${admNo}`);
    console.log(`Amount: KES ${amount.toFixed(2)}`);
    console.log(`Checkout Request ID: ${payment.id}`);
    console.log(`======================================================\n`);

    res.status(200).json({
      status: "success",
      message: "STK push query sent successfully. Please complete PIN prompt.",
      checkoutRequestId: payment.id,
      amount
    });

  } catch (err) {
    console.error("M-Pesa STK Push error:", err.message);
    res.status(500).json({ error: "Internal server error triggering payment prompt." });
  }
};

/**
 * Verifies or manually overrides the status of an M-Pesa payment.
 * Completes the transaction session.
 */
const verifyMpesaPayment = async (req, res) => {
  const { checkoutRequestId, mpesaCode } = req.body;

  if (!checkoutRequestId) {
    return res.status(400).json({ error: "Missing required field: checkoutRequestId." });
  }

  try {
    // Generate a random confirmation receipt code if none provided
    const receiptCode = mpesaCode ? mpesaCode.trim().toUpperCase() : "MOCK" + Math.floor(100000 + Math.random() * 900000).toString();

    // 1. Fetch current transaction state
    const { data: payment, error: fetchErr } = await supabase
      .from("sanCodeMpesa_payments")
      .select("*")
      .eq("id", checkoutRequestId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!payment) {
      return res.status(404).json({ error: "Payment checkout session not found." });
    }

    // 2. Update payment status to COMPLETED
    const { data: updatedPayment, error: updateErr } = await supabase
      .from("sanCodeMpesa_payments")
      .update({
        status: "COMPLETED",
        mpesa_receipt_number: receiptCode
      })
      .eq("id", checkoutRequestId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    console.log(`[M-PESA SUCCESS]: Payment completed for ADM ${updatedPayment.adm_no}. Receipt: ${receiptCode}`);

    // 3. Generate upgraded JWT token containing paid: true
    const token = jwt.sign(
      { admNo: Number(updatedPayment.adm_no), scope: "parent_lookup", paid: true },
      KEYS.JWT_SECRET,
      { expiresIn: "1h" } // Session expires in 1 hour
    );

    res.status(200).json({
      status: "success",
      message: "Payment successfully verified.",
      receipt: receiptCode,
      payment: updatedPayment,
      token
    });

  } catch (err) {
    console.error("Verify M-Pesa error:", err.message);
    res.status(500).json({ error: "Internal server error verifying payment." });
  }
};

module.exports = {
  initiateMockStkPush,
  verifyMpesaPayment
};
