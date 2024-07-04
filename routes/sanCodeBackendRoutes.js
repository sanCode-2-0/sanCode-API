import { Router } from "express";
import {
  createStaffRecord,
  defaultResponse,
  generateExcel,
  getDiseaseNames,
  getReportAnalytics,
  getReportData,
  getStaffData,
  getStaffMemberByID,
  getStudentByAdmissionNumber,
  getStudentData,
  getStudentsGoingToHospital,
  newStudents,
  staffFullEntry,
  staffQuickUpdate,
  studentFullEntry,
  studentQuickUpdate,
  updateReport,
} from "../controllers/sanCodeBackendControllers.js";

const router = Router();

router.route("/").get(defaultResponse);

router.route("/students/:admissionNumber").get(getStudentByAdmissionNumber);

router.route("/students-going-to-hospital").get(getStudentsGoingToHospital);

router.route("/student-full-entry").post(studentFullEntry);

router.route("/student-quick-update").post(studentQuickUpdate);

router.route("/staff/:idNo").get(getStaffMemberByID);

router.route("/staff-create-entry").post(createStaffRecord);

router.route("/staff-full-entry").post(staffFullEntry);

router.route("/staff-quick-update").post(staffQuickUpdate);

router.route("/student-data").get(getStudentData);

router.route("/staff-data").get(getStaffData);

router.route("/update-report").get(updateReport);

router.route("/generate-excel").get(generateExcel);

router.route("/new-students").post(newStudents);

router.route("/disease").get(getDiseaseNames);

router.route("/report").get(getReportData);

router.route("/report-analytics").get(getReportAnalytics);

router.route("/download-sqlite-database").get((req, res) => {
  // C:\Users\Briane\source\repos\sanCode-API\database\san-code.sqlite
  res.download("./database/san-code.sqlite");
});

export default router;
