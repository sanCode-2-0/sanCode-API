import { Router } from "express";
import { getStudentByAdmissionNumber } from "../controllers/sanCodeBackendControllers";

const router = Router();

router.route("/students/:admissionNumber").get(getStudentByAdmissionNumber);
