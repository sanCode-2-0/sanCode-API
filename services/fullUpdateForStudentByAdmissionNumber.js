import {Student} from "../models/Student.js";

export const fullUpdateForStudentByAdmissionNumber = async (updateItems) =>{
    try{
        const { admissionNumber, tempReading, complain, ailment, medication} = updateItems;
        const filter = { admNo: admissionNumber}
        const update = { tempReading: tempReading, complain: complain, ailment: ailment, medication: medication};
        return await Student.findOneAndUpdate(filter, update, {new: true});
    }catch(error){
        console.log(error)
    }
}