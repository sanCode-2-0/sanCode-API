const { Client } = require("pg");
const dotenv = require("dotenv");
dotenv.config();

const connectionString = `postgresql://postgres.hqaaeofsktwmuiybldpe:${encodeURIComponent(process.env.SUPABASE_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

const client = new Client({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function inspect() {
  try {
    await client.connect();
    console.log("Connected to database!");

    // Query triggers
    const res = await client.query(`
      SELECT 
        trigger_name, 
        event_manipulation, 
        event_object_table, 
        action_statement, 
        action_timing
      FROM information_schema.triggers
      WHERE event_object_table IN ('sanCodeStudent', 'sanCodeStaff');
    `);

    console.log("\n=== Database Triggers ===");
    console.log(res.rows);

    // Query trigger function definitions
    const funcRes = await client.query(`
      SELECT 
        p.proname AS function_name,
        prosrc AS function_body
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname IN (
        'log_student_history',
        'log_staff_history',
        'get_student_history',
        'get_staff_history'
      ) OR p.proname ILIKE '%history%' OR p.proname ILIKE '%student%' OR p.proname ILIKE '%staff%';
    `);

    console.log("\n=== Functions related to history/students/staff ===");
    for (const row of funcRes.rows) {
      console.log(`\n--- Function: ${row.function_name} ---`);
      console.log(row.function_body);
    }

  } catch (err) {
    console.error("Error inspecting database:", err.message);
  } finally {
    await client.end();
  }
}

inspect();
