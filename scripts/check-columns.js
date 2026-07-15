const dotenv = require("dotenv");
dotenv.config();

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://hqaaeofsktwmuiybldpe.supabase.co";
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseKey) {
  console.error("Missing SUPABASE_KEY in env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from("sanCodeMpesa_payments").select("*").limit(1);
  if (error) {
    console.error("Error querying sanCodeMpesa_payments:", error.message);
  } else {
    console.log("Success! Columns in sanCodeMpesa_payments:");
    if (data.length > 0) {
      console.log(Object.keys(data[0]));
    } else {
      console.log("No rows found to inspect columns. Trying to insert a test record...");
      // Try to insert a dummy record or get schema info if possible
      const { data: insertData, error: insertError } = await supabase
        .from("sanCodeMpesa_payments")
        .insert([{ adm_no: 9999, phone_number: "254700000000", amount: 50.00 }])
        .select();
      if (insertError) {
        console.error("Error inserting test record:", insertError.message);
      } else {
        console.log("Inserted test record columns:", Object.keys(insertData[0]));
        // Delete the test record
        await supabase.from("sanCodeMpesa_payments").delete().eq("adm_no", 9999);
      }
    }
  }
}

check();
