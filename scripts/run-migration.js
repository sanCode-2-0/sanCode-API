const { Client } = require("pg");
const dotenv = require("dotenv");
dotenv.config();

// Supavisor Connection Pooler URI
const connectionString = `postgresql://postgres.hqaaeofsktwmuiybldpe:${encodeURIComponent(process.env.SUPABASE_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

console.log("Connecting to Supabase PostgreSQL database via Supavisor pooler...");

const client = new Client({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  try {
    await client.connect();
    console.log("Successfully connected to database!");

    console.log("Running migrations on table sanCodeMpesa_payments...");
    
    // Check if columns exist first
    const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sanCodeMpesa_payments' 
      AND column_name IN ('merchant_request_id', 'checkout_request_id');
    `);
    
    const existingColumns = checkRes.rows.map(r => r.column_name);
    console.log("Existing target columns:", existingColumns);

    if (!existingColumns.includes("merchant_request_id")) {
      console.log("Adding column merchant_request_id...");
      await client.query(`ALTER TABLE "sanCodeMpesa_payments" ADD COLUMN merchant_request_id VARCHAR(100);`);
      console.log("Column merchant_request_id added successfully!");
    } else {
      console.log("Column merchant_request_id already exists.");
    }

    if (!existingColumns.includes("checkout_request_id")) {
      console.log("Adding column checkout_request_id...");
      await client.query(`ALTER TABLE "sanCodeMpesa_payments" ADD COLUMN checkout_request_id VARCHAR(100);`);
      console.log("Column checkout_request_id added successfully!");
    } else {
      console.log("Column checkout_request_id already exists.");
    }

    console.log("Migration finished successfully!");
  } catch (err) {
    console.error("Migration error:", err.message);
  } finally {
    await client.end();
  }
}

migrate();
