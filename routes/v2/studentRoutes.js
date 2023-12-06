import { Router } from "express"
import {getAllStudents} from "../../services/getAllStudents.js";
import {getStudentByAdmissionNumber} from "../../services/getStudentByAdmissionNumber.js";
import {updateTempReadingByAdmissionNumber} from "../../services/updateTempReadingByAdmissionNumber.js";
import {fullUpdateForStudentByAdmissionNumber} from "../../services/fullUpdateForStudentByAdmissionNumber.js";

const router = Router();

//Routes
router.get("/",(req,res)=>{
    res.json({status:200,message:"Make requests to the /student endpoint"})
})
//Get all student data
router.get("/all",async (req, res) => {
    try{
    const allStudentsData = await getAllStudents();
    res.json(allStudentsData)
    }catch(error){
        console.log(error)
    }
})

//Get student by admissionNumber
router.get("/:admissionNumber",async(req,res)=>{
    try{
        const { admissionNumber } = req.params;
        const studentByAdmissionNumber = await getStudentByAdmissionNumber(admissionNumber);
        res.json(studentByAdmissionNumber)
    } catch(error){
        console.log(error)
    }
})

//Update temp reading
router.put("/temp-update/:admissionNumber",async(req,res)=>{
    try {
        const { admissionNumber } = req.params;
        const { tempReading } = req.body;
        const updateTempReadingForStudent = await updateTempReadingByAdmissionNumber(admissionNumber, tempReading)
        res.json(updateTempReadingForStudent)
    } catch(error){
        console.log(error)
    }
})

//Full Entry
router.put("/full-update/:admissionNumber",async(req, res)=>{
    try {
        const { admissionNumber } = req.params;
        const { tempReading, complain, ailment, medication } = req.body;
        const fullUpdateForStudent = await fullUpdateForStudentByAdmissionNumber({ admissionNumber, tempReading, complain, ailment, medication});
        res.json(fullUpdateForStudent);
    } catch(error){
        console.log(error)
    }
})
export default router;