const { Router } = require("express");
const {
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
  newStudents,
  staffFullEntry,
  staffQuickUpdate,
  studentFullEntry,
  studentQuickUpdate,
  updateReport,
} = require("../controllers/sanCodeBackendControllers.js");

const router = Router();

router.route("/").get(defaultResponse);

router.route("/students/:admissionNumber").get(getStudentByAdmissionNumber);

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

router.route("/new-students").get(newStudents);

router.route("/disease").get(getDiseaseNames);

router.route("/report").get(getReportData);

router.route("/report-analytics").get(getReportAnalytics);

module.exports = router;
