const { supabase } = require("../config/supabase/config.js");
const { studentTableName, staffTableName } = require("../config/database.js");
const moment = require("moment-timezone");

const getDailyAttendanceLog = async (req, res) => {
  try {
    const monthParam = req.query.month; // e.g. "2026-07-01" or "2026-07"
    const target = monthParam ? moment(monthParam) : moment();

    if (!target.isValid()) {
      return res.status(400).json({ error: "Invalid month format. Use YYYY-MM-DD or YYYY-MM" });
    }

    // Set cutoffs for start and end of target month in Nairobi timezone
    const startOfMonth = target.clone().startOf("month").tz("Africa/Nairobi").format("YYYY-MM-DD HH:mm:ss");
    const endOfMonth = target.clone().endOf("month").tz("Africa/Nairobi").format("YYYY-MM-DD HH:mm:ss");

    // Fetch from history and current tables for both students and staff
    const [studentHistResult, studentCurrentResult, staffHistResult, staffCurrentResult] = await Promise.all([
      supabase
        .from("sanCodeStudent_history")
        .select("timestamp, admNo, fName, sName, class, tempReading, complain, ailment, medication, going_to_hospital")
        .gte("timestamp", startOfMonth)
        .lte("timestamp", endOfMonth)
        .neq("ailment", ""),
      supabase
        .from(studentTableName)
        .select("timestamp, admNo, fName, sName, class, tempReading, complain, ailment, medication, going_to_hospital")
        .gte("timestamp", startOfMonth)
        .lte("timestamp", endOfMonth)
        .neq("ailment", ""),
      supabase
        .from("sanCodeStaff_history")
        .select("timestamp, idNo, fName, sName, tempReading, complain, ailment, medication")
        .gte("timestamp", startOfMonth)
        .lte("timestamp", endOfMonth)
        .neq("ailment", ""),
      supabase
        .from(staffTableName)
        .select("timestamp, idNo, fName, sName, tempReading, complain, ailment, medication")
        .gte("timestamp", startOfMonth)
        .lte("timestamp", endOfMonth)
        .neq("ailment", "")
    ]);

    if (
      studentHistResult.error ||
      studentCurrentResult.error ||
      staffHistResult.error ||
      staffCurrentResult.error
    ) {
      console.error(
        "Error fetching daily attendance data:",
        studentHistResult.error ||
          studentCurrentResult.error ||
          staffHistResult.error ||
          staffCurrentResult.error
      );
      return res.status(500).json({ error: "Error fetching database history" });
    }

    const seen = new Set();
    const visits = [];

    // Process students
    const rawStudentVisits = [
      ...(studentHistResult.data || []),
      ...(studentCurrentResult.data || [])
    ];
    for (const v of rawStudentVisits) {
      const key = `student_${v.admNo}_${v.timestamp}`;
      if (!seen.has(key)) {
        seen.add(key);
        visits.push({
          type: "student",
          id: v.admNo,
          fName: v.fName,
          sName: v.sName,
          class: v.class || "Unknown",
          tempReading: v.tempReading,
          complain: v.complain,
          ailment: v.ailment,
          medication: v.medication,
          going_to_hospital: v.going_to_hospital,
          timestamp: v.timestamp
        });
      }
    }

    // Process staff
    const rawStaffVisits = [
      ...(staffHistResult.data || []),
      ...(staffCurrentResult.data || [])
    ];
    for (const v of rawStaffVisits) {
      const key = `staff_${v.idNo}_${v.timestamp}`;
      if (!seen.has(key)) {
        seen.add(key);
        visits.push({
          type: "staff",
          id: v.idNo,
          fName: v.fName,
          sName: v.sName,
          class: "Staff",
          tempReading: v.tempReading,
          complain: v.complain,
          ailment: v.ailment,
          medication: v.medication,
          going_to_hospital: 0,
          timestamp: v.timestamp
        });
      }
    }

    // Sort visits descending (most recent first) by default
    visits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.status(200).json(visits);
  } catch (err) {
    console.error("Error in getDailyAttendanceLog:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
};

module.exports = {
  getDailyAttendanceLog
};
