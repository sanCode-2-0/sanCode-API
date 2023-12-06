import {Student} from "../models/Student.js";

export const updateTempReadingByAdmissionNumber = async (admissionNumber,newTempReading) =>{
    try{
        const filter = { "admNo" : admissionNumber}
        const update = { "tempReading" : newTempReading}
        const updateTempReadingByAdmissionNumber = await Student.findOneAndUpdate(filter,update,{
            new: true,
        });
        return updateTempReadingByAdmissionNumber
    } catch(error){
        console.log(error)
    }
}