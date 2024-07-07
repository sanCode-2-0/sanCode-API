import dotenv from "dotenv";
dotenv.config();

export const KEYS = {
  PORT: process.env.PORT,
  //Path to Home
  HOME: process.env.HOME,
  LOG_DIR: "./logs",
  MONGO_URI: process.env.MONGO_URI,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  SUPABASE_EMAIL: process.env.SUPABASE_EMAIL,
  SUPABASE_PASSWORD: process.env.SUPABASE_PASSWORD,
};
