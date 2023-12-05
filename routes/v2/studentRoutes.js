import { Router } from "express"
import {getAllStudents} from "../../services/getAllStudents.js";

const router = Router();

//Routes
//Get all student data
router.get("/",async (req, res) => {
    const allStudentsData = await getAllStudents();
    res.json({studentsData : allStudentsData})
})
export default router;