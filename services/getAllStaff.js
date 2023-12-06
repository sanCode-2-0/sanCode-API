import {Staff} from "../models/Staff.js";

export const getAllStaff = async () =>{
    const allStaff = await Staff.find();
    return allStaff;
}