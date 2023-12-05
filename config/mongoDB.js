import mongoose from "mongoose";
import { KEYS } from "./keys.js";

export const connectToMongoDB = async () =>{
    try {
        await mongoose.connect(KEYS.MONGO_URI)
        console.log("MongoDB connected")
        //Winston
    }catch(error){
        //Winston
        console.error(error)
    }
}