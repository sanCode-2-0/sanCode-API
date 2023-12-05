import {Student} from "../models/Student.js";

export const getAllStudents = async () =>{
    try {
        const allStudentsData = await Student.find();
        return allStudentsData;
    } catch(error){
        console.log(error)
    }
}