import dotenv from "dotenv";
dotenv.config();

export const KEYS = {
  PORT: process.env.PORT,
  //Path to Home
  HOME: process.env.HOME,
  LOG_DIR: "./logs",
  MONGO_URI: process.env.MONGO_URI,
  NODE_ENV: process.env.NODE_ENV
};
