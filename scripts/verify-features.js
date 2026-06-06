// scripts/verify-features.js
const { parseMedications } = require("../helpers/medicationParser.js");

// 1. Test Medication Parser logic directly
console.log("==========================================");
console.log("     TESTING MEDICATION PARSING LOGIC     ");
console.log("==========================================");

const testCases = [
  { input: "AZITH,PCM,LORAT", expected: 3 },
  { input: "AZITH,LORAT,BRUFEN", expected: 3 },
  { input: "DICLO TABS,GEL", expected: 2 },
  { input: "DICLO TABS,DICLO GEL", expected: 2 },
  { input: "LORAT,DELASED", expected: 2 },
  { input: "REFERED TO KIKUYU HOSP", expected: 0 },
  { input: "AMOXCLAV,PCM,LORAT", expected: 3 },
  { input: "AMPICLOX QID,BRUFEN", expected: 2 },
  { input: "TO BE PICKED BY PARENT", expected: 0 },
  { input: "ABZ 400MG STAT", expected: 1 },
  { input: "ETEROXIB 1 OD,GEL", expected: 2 }
];

let parserPassed = true;
testCases.forEach((tc, idx) => {
  const result = parseMedications(tc.input);
  const passed = result.length === tc.expected;
  console.log(`Test #${idx + 1}: "${tc.input}"`);
  console.log(`   -> Parsed:`, JSON.stringify(result));
  console.log(`   -> Status: ${passed ? "PASS" : "FAIL"}`);
  if (!passed) parserPassed = false;
});

console.log("\nParser overall status:", parserPassed ? "SUCCESS" : "FAILURE");
console.log("==========================================\n");

// 2. Test DB Connection if credentials exist
const { KEYS } = require("../config/keys.js");
const { supabase } = require("../config/supabase/config.js");

async function verifyDbIntegration() {
  console.log("==========================================");
  console.log("      TESTING DATABASE INTEGRATION        ");
  console.log("==========================================");
  
  if (!process.env.SUPABASE_KEY) {
    console.log("[Info]: Missing '.env' file. Skipping live database connection tests.");
    console.log("To run live database checks, please populate your '.env' file.");
    console.log("==========================================");
    return;
  }

  try {
    console.log("Connecting to Supabase...");
    const { data: studentSample, error } = await supabase
      .from("sanCodeStudent")
      .select("admNo, fName, sName")
      .limit(1);

    if (error) {
      console.error("Database connection error:", error.message);
      return;
    }

    console.log("Database Connection: SUCCESS");
    console.log("Fetched sample student:", studentSample);
    
    // Check tables exists
    const { data: invSample, error: invError } = await supabase
      .from("sanCodeMedication_inventory")
      .select("count", { count: 'exact', head: true });

    if (invError) {
      console.error("Inventory table status: NOT FOUND or ERROR:", invError.message);
    } else {
      console.log("Inventory table status: FOUND");
    }

    const { error: otpError } = await supabase
      .from("sanCodeOTP_verifications")
      .select("count", { count: 'exact', head: true });

    if (otpError) {
      console.error("OTP Verification table status: NOT FOUND or ERROR:", otpError.message);
    } else {
      console.log("OTP Verification table status: FOUND");
    }

  } catch (err) {
    console.error("Integration exception:", err.message);
  }
  console.log("==========================================");
}

verifyDbIntegration();
