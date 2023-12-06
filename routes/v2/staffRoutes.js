import { Router } from "express"
import {getAllStaff} from "../../services/getAllStaff.js";

const router = Router();

router.get("/",(req,res)=>{
    res.json({status:200,message:"Make requests to the /staff endpoint"})
})
router.get("/all",async (req, res)=>{
    const allStaffData = await getAllStaff();
    res.json({allStaffData})
})

export default router