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

    // Query column definitions for student and staff tables
    const res = await client.query(`
      SELECT 
        table_name, 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name IN ('sanCodeStudent', 'sanCodeStudent_history', 'sanCodeStaff', 'sanCodeStaff_history')
      ORDER BY table_name, ordinal_position;
    `);

    console.log("\n=== Column Schema ===");
    const schema = {};
    res.rows.forEach(r => {
      if (!schema[r.table_name]) schema[r.table_name] = [];
      schema[r.table_name].push({
        column: r.column_name,
        type: r.data_type,
        nullable: r.is_nullable,
        default: r.column_default
      });
    });
    console.log(JSON.stringify(schema, null, 2));

  } catch (err) {
    console.error("Error inspecting database schema:", err.message);
  } finally {
    await client.end();
  }
}

inspect();
