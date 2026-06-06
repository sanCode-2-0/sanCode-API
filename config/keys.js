const dotenv = require("dotenv");
dotenv.config();

const KEYS = {
  PORT: process.env.PORT || 8080,
  //Path to Home (fallback to USERPROFILE on Windows)
  HOME: process.env.HOME || process.env.USERPROFILE,
  LOG_DIR: "./logs",
  MONGO_URI: process.env.MONGO_URI,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  SUPABASE_EMAIL: process.env.SUPABASE_EMAIL,
  SUPABASE_PASSWORD: process.env.SUPABASE_PASSWORD,
  JWT_SECRET: process.env.JWT_SECRET || "fallback_beast_jwt_secret",
};

// Friendly validation check for required environment variables
if (!KEYS.SUPABASE_KEY || !KEYS.SUPABASE_EMAIL || !KEYS.SUPABASE_PASSWORD) {
  console.error("\x1b[31m%s\x1b[0m", "\n=================================================================");
  console.error("\x1b[31m%s\x1b[0m", "  ERROR: Missing Required Supabase Environment Variables!");
  console.error("\x1b[31m%s\x1b[0m", "=================================================================");
  console.error(" Please create a '.env' file in the 'sanCode-API' root folder with:");
  console.error("   SUPABASE_KEY=your_supabase_anon_key");
  console.error("   SUPABASE_EMAIL=your_supabase_auth_email");
  console.error("   SUPABASE_PASSWORD=your_supabase_auth_password");
  console.error("\n Optional variables:");
  console.error("   PORT=8080 (default)");
  console.error("   HOME=path_to_home (defaults to your Windows profile folder)");
  console.error("\x1b[31m%s\x1b[0m", "=================================================================\n");
  process.exit(1);
}

module.exports = { KEYS };
