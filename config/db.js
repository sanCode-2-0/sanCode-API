import mongoose from "mongoose";
import { KEYS } from "./keys.js";

const connectDB = async () => {
  try {
    await mongoose.connect(KEYS.MONGO_URI);
    console.log(`Mongo is Connected`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

export default connectDB;
