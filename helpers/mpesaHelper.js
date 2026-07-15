// helpers/mpesaHelper.js
const axios = require("axios");
const moment = require("moment-timezone");

let cachedToken = null;
let tokenExpiry = null; // Timestamp when token expires

/**
 * Gets the base URL for the M-Pesa API depending on the environment.
 */
const getMpesaBaseUrl = () => {
  const env = process.env.MPESA_ENV || "sandbox";
  return env.toLowerCase() === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
};

/**
 * Checks if all required Daraja credentials are set in the environment.
 */
const hasMpesaCredentials = () => {
  if (process.env.NODE_ENV === "test") {
    return false;
  }
  return !!(
    process.env.MPESA_CONSUMER_KEY &&
    process.env.MPESA_CONSUMER_SECRET &&
    process.env.MPESA_SHORTCODE &&
    process.env.MPESA_PASSKEY &&
    process.env.MPESA_CALLBACK_URL
  );
};

/**
 * Fetches and caches the M-Pesa OAuth2 Access Token.
 */
const getMpesaAccessToken = async () => {
  if (!hasMpesaCredentials()) {
    return null;
  }

  // Reuse token if it exists and has at least 60 seconds before expiration
  if (cachedToken && tokenExpiry && Date.now() < (tokenExpiry - 60000)) {
    return cachedToken;
  }

  try {
    const baseUrl = getMpesaBaseUrl();
    const consumerKey = process.env.MPESA_CONSUMER_KEY.trim();
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET.trim();
    
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    
    console.log(`[M-PESA] Fetching new access token from ${baseUrl}/oauth/v1/generate`);
    const response = await axios.get(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: {
        Authorization: `Basic ${auth}`
      }
    });

    if (response.data && response.data.access_token) {
      cachedToken = response.data.access_token;
      // Expires in is usually 3599 seconds
      const expiresInMs = parseInt(response.data.expires_in, 10) * 1000;
      tokenExpiry = Date.now() + expiresInMs;
      console.log(`[M-PESA] Token fetched and cached successfully. Expires in ${response.data.expires_in}s.`);
      return cachedToken;
    } else {
      throw new Error("Invalid response format from Safaricom OAuth API");
    }
  } catch (err) {
    const errMsg = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
    console.error("[M-PESA] Error generating access token:", errMsg);
    throw new Error(`Failed to generate M-Pesa access token: ${errMsg}`);
  }
};

/**
 * Generates base64 security password for Lipa Na M-Pesa online API.
 */
const generatePassword = (shortCode, passKey, timestamp) => {
  return Buffer.from(shortCode + passKey + timestamp).toString("base64");
};

/**
 * Initiates an M-Pesa Express (STK Push) transaction on the customer's phone.
 * 
 * @param {string} phoneNumber - Recipient phone number (format: 2547XXXXXXXX or 07XXXXXXXX)
 * @param {number} amount - Amount in KES
 * @param {number|string} admNo - Student admission number
 */
const sendStkPush = async (phoneNumber, amount, admNo) => {
  if (!hasMpesaCredentials()) {
    console.log("[M-PESA] Missing environment credentials. Skipping live STK Push.");
    return null;
  }

  const token = await getMpesaAccessToken();
  if (!token) {
    throw new Error("Could not retrieve M-Pesa access token.");
  }

  // Format phone number to 2547XXXXXXXX
  let formattedPhone = phoneNumber.trim().replace(/\s+/g, "");
  if (formattedPhone.startsWith("+")) {
    formattedPhone = formattedPhone.substring(1);
  }
  if (formattedPhone.startsWith("0")) {
    formattedPhone = "254" + formattedPhone.substring(1);
  }
  if (!/^254\d{9}$/.test(formattedPhone)) {
    throw new Error(`Invalid phone number format: ${phoneNumber}. Must be a valid Kenyan mobile number.`);
  }

  const baseUrl = getMpesaBaseUrl();
  const shortCode = process.env.MPESA_SHORTCODE.trim();
  const passKey = process.env.MPESA_PASSKEY.trim();
  const callbackUrl = process.env.MPESA_CALLBACK_URL.trim();
  const timestamp = moment().tz("Africa/Nairobi").format("YYYYMMDDHHmmss");
  const password = generatePassword(shortCode, passKey, timestamp);

  const payload = {
    BusinessShortCode: shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(amount), // Ensure integer
    PartyA: formattedPhone,
    PartyB: shortCode,
    PhoneNumber: formattedPhone,
    CallBackURL: callbackUrl,
    AccountReference: `ADM-${admNo}`,
    TransactionDesc: `Paywall Lookup Fee ADM ${admNo}`
  };

  try {
    console.log(`[M-PESA] Dispatched STK Push Request to ${formattedPhone} for KES ${amount}`);
    const response = await axios.post(`${baseUrl}/mpesa/stkpush/v1/processrequest`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    return response.data;
  } catch (err) {
    const errMsg = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
    console.error("[M-PESA] STK Push Request Failed:", errMsg);
    throw new Error(`M-Pesa STK Push API error: ${errMsg}`);
  }
};

module.exports = {
  hasMpesaCredentials,
  getMpesaAccessToken,
  sendStkPush
};
