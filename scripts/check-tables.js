
const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const client = new Client({
  connectionString: 'postgresql://postgres.hqaaeofsktwmuiybldpe:' + encodeURIComponent(process.env.SUPABASE_PASSWORD) + '@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function getTables() {
  await client.connect();
  const res = await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name;');
  console.log(res.rows.map(r => r.table_name));
  await client.end();
}
getTables().catch(console.error);
