const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

async function test() {
  const consumerKey = (process.env.MPESA_CONSUMER_KEY || "").trim();
  const consumerSecret = (process.env.MPESA_CONSUMER_SECRET || "").trim();
  const baseUrl = "https://sandbox.safaricom.co.ke";

  console.log("Consumer Key:", JSON.stringify(consumerKey));
  console.log("Consumer Secret:", JSON.stringify(consumerSecret));

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const url = `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`;

  console.log("Making request with User-Agent header...");

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    console.log("Success! Token response data:", response.data);
  } catch (err) {
    console.error("Failed with status:", err.response ? err.response.status : "No response");
    if (err.response) {
      console.error("Response headers:", err.response.headers);
      console.error("Response body:", err.response.data);
    } else {
      console.error("Error message:", err.message);
    }
  }
}

test();
