import {Student} from "../models/Student.js";

export const getStudentByAdmissionNumber = async (admissionNumber) =>{
    try{
    const studentByAdmissionNumber = Student.findOne({"admNo":admissionNumber});
    return studentByAdmissionNumber;
    }catch(error){
        console.log(error)
    }
}