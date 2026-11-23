const { Pool } = require("pg");
const dotenv = require("dotenv");
dotenv.config();

const connectionString = `postgresql://postgres.hqaaeofsktwmuiybldpe:${encodeURIComponent(process.env.SUPABASE_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

module.exports = { pool };
