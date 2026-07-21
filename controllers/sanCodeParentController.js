// controllers/sanCodeParentController.js
const { supabase } = require("../config/supabase/config.js");
const jwt = require("jsonwebtoken");
const moment = require("moment-timezone");
const { KEYS } = require("../config/keys.js");

/**
 * Requests an OTP for child record access.
 * Validates that parentContact matches parent_phone or parent_email on student record.
 */
const requestParentOTP = async (req, res) => {
  const { admNo, parentContact } = req.body;

  if (!admNo || !parentContact) {
    return res.status(400).json({ error: "Missing required fields: admNo and parentContact." });
  }

  try {
    // 1. Fetch student to check parent records
    const { data: student, error: studentError } = await supabase
      .from("sanCodeStudent")
      .select("admNo, fName, sName, parent_phone, parent_email")
      .eq("admNo", admNo)
      .maybeSingle();

    if (studentError) throw studentError;

    if (!student) {
      return res.status(404).json({ error: "Student not found with the provided Admission Number." });
    }

    // Normalized comparisons
    const contactClean = parentContact.trim().toLowerCase();
    const dbPhone = (student.parent_phone || "").trim().toLowerCase();
    const dbEmail = (student.parent_email || "").trim().toLowerCase();

    if (contactClean !== dbPhone && contactClean !== dbEmail) {
      return res.status(403).json({ error: "Access Denied: Provided contact info does not match registered parent details." });
    }

    // 2. Generate a secure 6-digit random code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    // Expiration: 5 minutes from now in Nairobi time
    const expiresAt = moment().tz("Africa/Nairobi").add(5, "minutes").format("YYYY-MM-DD HH:mm:ss");

    // 3. Save OTP verification record
    const { error: insertError } = await supabase
      .from("sanCodeOTP_verifications")
      .insert([{
        adm_no: admNo,
        parent_contact: parentContact.trim(),
        otp_code: otpCode,
        expires_at: expiresAt,
        verified: false
      }]);

    if (insertError) throw insertError;

    // 4. Mock SMS/Email dispatching (Logs to server stream in dev mode)
    console.log(`\n======================================================`);
    console.log(`[OTP NOTIFICATION] To: ${parentContact}`);
    console.log(`Verification Code for ${student.fName} ${student.sName}'s records: ${otpCode}`);
    console.log(`Expires at: ${expiresAt} EAT`);
    console.log(`======================================================\n`);

    res.status(200).json({
      status: "success",
      message: "Verification code sent successfully to registered parent contact info.",
      otp: otpCode
    });

  } catch (err) {
    console.error("Error requesting parent OTP:", err.message);
    res.status(500).json({ error: "Internal server error while generating verification code." });
  }
};

/**
 * Verifies the OTP code and responds with a secure short-lived token.
 */
const verifyParentOTP = async (req, res) => {
  const { admNo, parentContact, otp } = req.body;

  if (!admNo || !parentContact || !otp) {
    return res.status(400).json({ error: "Missing required fields: admNo, parentContact, and otp." });
  }

  try {
    const nowEAT = moment().tz("Africa/Nairobi").format("YYYY-MM-DD HH:mm:ss");

    // Find valid, unused, unexpired OTP matching details
    const { data: otpRecord, error: otpError } = await supabase
      .from("sanCodeOTP_verifications")
      .select("*")
      .eq("adm_no", admNo)
      .eq("parent_contact", parentContact.trim())
      .eq("otp_code", otp.trim())
      .gt("expires_at", nowEAT)
      .eq("verified", false)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError) throw otpError;

    if (!otpRecord) {
      return res.status(401).json({ error: "Invalid or expired verification code." });
    }

    // Mark verification code as used/verified
    const { error: updateError } = await supabase
      .from("sanCodeOTP_verifications")
      .update({ verified: true })
      .eq("id", otpRecord.id);

    if (updateError) throw updateError;

    // Generate JWT token containing the child's admission number, parent scope, and paid: false
    const token = jwt.sign(
      { admNo: Number(admNo), scope: "parent_lookup", paid: false },
      KEYS.JWT_SECRET,
      { expiresIn: "1h" } // Session expires in 1 hour
    );

    res.status(200).json({
      status: "success",
      token
    });

  } catch (err) {
    console.error("Error verifying parent OTP:", err.message);
    res.status(500).json({ error: "Internal server error during verification process." });
  }
};

/**
 * Returns student clinical logs for the authorized student matching the JWT payload.
 */
const getParentStudentHistory = async (req, res) => {
  const authorizedAdmNo = req.parent.admNo;
  const isPaid = req.parent.paid;

  if (!isPaid) {
    return res.status(402).json({
      error: "Payment Required",
      message: "Access to student clinical history requires a fee of KES 50.00."
    });
  }
  try {
    // Fetch student profile details for metadata and latest visit details
    const { data: student, error: studError } = await supabase
      .from("sanCodeStudent")
      .select("fName, sName, class, timestamp, tempReading, complain, ailment, medication, going_to_hospital")
      .eq("admNo", authorizedAdmNo)
      .maybeSingle();

    if (studError) throw studError;

    // Query history logs for child
    const { data: historyData, error: historyError } = await supabase
      .from("sanCodeStudent_history")
      .select("timestamp, tempReading, complain, ailment, medication, going_to_hospital")
      .eq("admNo", authorizedAdmNo)
      .order("timestamp", { ascending: false });

    if (historyError) throw historyError;

    // Merge active visit if it is not already in the history list
    let visits = historyData ? [...historyData] : [];
    if (student && (student.ailment || student.complain)) {
      const isAlreadyInHistory = visits.some(h => h.timestamp === student.timestamp);
      if (!isAlreadyInHistory) {
        visits.unshift({
          timestamp: student.timestamp,
          tempReading: student.tempReading,
          complain: student.complain,
          ailment: student.ailment,
          medication: student.medication,
          going_to_hospital: student.going_to_hospital
        });
      }
    }

    res.status(200).json({
      status: "success",
      studentInfo: student ? { fName: student.fName, sName: student.sName, class: student.class } : null,
      records: visits
    });

  } catch (err) {
    console.error("Error fetching child history records:", err.message);
    res.status(500).json({ error: "Internal server error retrieving student health records." });
  }
};

module.exports = {
  requestParentOTP,
  verifyParentOTP,
  getParentStudentHistory
};
