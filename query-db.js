// query-db.js
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

async function run() {
  console.log("=== Querying Medication Inventory ===");
  const { data: inv, error: invErr } = await supabase
    .from("sanCodeMedication_inventory")
    .select("*");
  
  if (invErr) {
    console.error("Error fetching inventory:", invErr);
  } else {
    console.log(`Found ${inv.length} items in inventory:`);
    console.log(inv);
  }

  console.log("\n=== Querying Medication Batches ===");
  const { data: batches, error: batchErr } = await supabase
    .from("sanCodeMedication_batches")
    .select("*");
  
  if (batchErr) {
    console.error("Error fetching batches:", batchErr);
  } else {
    console.log(`Found ${batches.length} batches:`);
    console.log(batches);
  }

  console.log("\n=== Querying Unique Medications in Student History ===");
  const { data: history, error: histErr } = await supabase
    .from("sanCodeStudent_history")
    .select("medication")
    .neq("medication", "")
    .neq("medication", "null")
    .limit(100);

  if (histErr) {
    console.error("Error fetching history:", histErr);
  } else {
    const meds = new Set();
    history.forEach(h => {
      if (h.medication) {
        h.medication.split(",").forEach(m => meds.add(m.trim().toUpperCase()));
      }
    });
    console.log("Unique medication codes in student history:", Array.from(meds));
  }
}

run();
