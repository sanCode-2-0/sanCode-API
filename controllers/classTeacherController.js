const { supabase } = require("../config/supabase/config.js");
const { studentTableName } = require("../config/database.js");
const moment = require("moment-timezone");

// Verify teacher passcode helper
async function checkPasscode(passcode) {
  if (!passcode) return false;
  const { data: configData, error } = await supabase
    .from("sanCodeSettings")
    .select("value")
    .eq("key", "teacher_passcode")
    .maybeSingle();

  if (error) {
    console.error("Error reading teacher passcode:", error.message);
    return false;
  }
  const dbPasscode = configData ? configData.value : "staff123";
  return passcode.trim() === dbPasscode.trim();
}

// GET /class-teachers
const getAllClassTeachers = async (req, res) => {
  try {
    const todayStart = moment().tz("Africa/Nairobi").startOf("day").format("YYYY-MM-DD HH:mm:ss");

    // 1. Fetch teacher assignments
    const { data: teachers, error: teacherErr } = await supabase
      .from("sanCodeClassTeachers")
      .select("*")
      .order("class", { ascending: true });

    if (teacherErr) throw teacherErr;

    const teacherList = teachers || [];

    // 2. Fetch exact student counts and today's visits per class in parallel
    const [countResults, todayVisitsHistoryRes, todayVisitsActiveRes] = await Promise.all([
      Promise.all(teacherList.map(t =>
        supabase.from(studentTableName).select("*", { count: "exact", head: true }).eq("class", t.class)
      )),
      supabase
        .from("sanCodeStudent_history")
        .select("class, admNo")
        .gte("timestamp", todayStart)
        .neq("ailment", ""),
      supabase
        .from(studentTableName)
        .select("class, admNo")
        .gte("timestamp", todayStart)
        .neq("ailment", "")
    ]);

    // Count today's unique student clinic visits per class
    const classVisitsToday = {};
    const seenVisits = new Set();
    const allTodayVisits = [
      ...(todayVisitsHistoryRes.data || []),
      ...(todayVisitsActiveRes.data || [])
    ];

    allTodayVisits.forEach(v => {
      if (v.class && v.admNo) {
        const key = `${v.admNo}_${v.class}`;
        if (!seenVisits.has(key)) {
          seenVisits.add(key);
          classVisitsToday[v.class] = (classVisitsToday[v.class] || 0) + 1;
        }
      }
    });

    // Merge teacher info with live stats
    const result = teacherList.map((t, idx) => ({
      ...t,
      studentCount: countResults[idx]?.count || 0,
      visitsToday: classVisitsToday[t.class] || 0
    }));

    res.status(200).json({ status: "success", classTeachers: result });
  } catch (err) {
    console.error("Error in getAllClassTeachers:", err.message);
    res.status(500).json({ error: "Failed to fetch class teachers." });
  }
};

// GET /class-teachers/:className
const getClassDetails = async (req, res) => {
  const { className } = req.params;
  const passcode = req.query.passcode || req.headers["x-teacher-passcode"];

  if (!className) {
    return res.status(400).json({ error: "Class name is required." });
  }

  const isAuth = await checkPasscode(passcode);
  if (!isAuth) {
    return res.status(403).json({ error: "Access Denied: Incorrect teacher passcode." });
  }

  try {
    const formattedClass = className.trim().toUpperCase();
    const todayStart = moment().tz("Africa/Nairobi").startOf("day").format("YYYY-MM-DD HH:mm:ss");
    const weekStart = moment().tz("Africa/Nairobi").startOf("isoWeek").format("YYYY-MM-DD HH:mm:ss");

    // 1. Fetch teacher info for this class
    const { data: teacherInfo } = await supabase
      .from("sanCodeClassTeachers")
      .select("*")
      .eq("class", formattedClass)
      .maybeSingle();

    // 2. Fetch class students
    const { data: students, error: studErr } = await supabase
      .from(studentTableName)
      .select("recordID, admNo, fName, sName, tName, fourthName, class, house, going_to_hospital, tempReading, complain, ailment, medication, timestamp")
      .eq("class", formattedClass)
      .order("fName", { ascending: true });

    if (studErr) throw studErr;

    const classAdmNos = (students || []).map(s => s.admNo);

    // 3. Fetch recent clinic visits and follow-ups for this class
    let recentVisits = [];
    let pendingFollowUps = [];

    if (classAdmNos.length > 0) {
      const [historyRes, followUpsRes] = await Promise.all([
        supabase
          .from("sanCodeStudent_history")
          .select("recordID, admNo, fName, sName, class, tempReading, complain, ailment, medication, timestamp")
          .in("admNo", classAdmNos)
          .gte("timestamp", weekStart)
          .neq("ailment", "")
          .order("timestamp", { ascending: false }),
        supabase
          .from("sanCodeFollow_ups")
          .select("*")
          .in("adm_no", classAdmNos)
          .eq("status", "pending")
      ]);

      const historyVisits = historyRes.data || [];
      pendingFollowUps = followUpsRes.data || [];

      // Also check active student table records if timestamp is this week and has ailment
      const activeVisits = (students || []).filter(s => s.timestamp >= weekStart && s.ailment && s.ailment.trim() !== "");

      // Deduplicate visits
      const visitMap = new Map();
      [...activeVisits, ...historyVisits].forEach(v => {
        const key = `${v.admNo}_${v.timestamp}`;
        if (!visitMap.has(key)) {
          visitMap.set(key, v);
        }
      });

      recentVisits = Array.from(visitMap.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // Map clinic status to each student in the roster
    const studentsWithStatus = (students || []).map(s => {
      const studentVisitsToday = recentVisits.filter(v => v.admNo === s.admNo && v.timestamp >= todayStart);
      const studentFollowUps = pendingFollowUps.filter(f => f.adm_no === s.admNo);
      const hasPendingFollowUp = studentFollowUps.length > 0;
      const isReferred = s.going_to_hospital === 1;

      let clinicStatus = "In Class / Normal";
      if (isReferred) {
        clinicStatus = "Referred to Hospital";
      } else if (hasPendingFollowUp) {
        clinicStatus = "Follow-up Due";
      } else if (studentVisitsToday.length > 0) {
        clinicStatus = "Visited Clinic Today";
      }

      return {
        ...s,
        clinicStatus,
        visitsTodayCount: studentVisitsToday.length,
        hasPendingFollowUp,
        isReferred,
        followUps: studentFollowUps
      };
    });

    // Calculate class quick metrics
    const visitedTodayCount = studentsWithStatus.filter(s => s.visitsTodayCount > 0).length;
    const hospitalCount = studentsWithStatus.filter(s => s.isReferred).length;
    const followUpCount = pendingFollowUps.length;

    return res.status(200).json({
      status: "success",
      className: formattedClass,
      teacher: teacherInfo ? teacherInfo.teacher_name : "Not Assigned",
      teacherDetails: teacherInfo || null,
      metrics: {
        totalStudents: studentsWithStatus.length,
        visitedToday: visitedTodayCount,
        pendingFollowUps: followUpCount,
        referredToHospital: hospitalCount
      },
      roster: studentsWithStatus,
      recentVisits,
      pendingFollowUps
    });
  } catch (err) {
    console.error("Error in getClassDetails:", err.message);
    res.status(500).json({ error: "Failed to fetch class details." });
  }
};

// PUT /class-teachers/:className
const updateClassTeacher = async (req, res) => {
  const { className } = req.params;
  const { teacher_name, email, phone, grade } = req.body;
  const passcode = req.query.passcode || req.headers["x-teacher-passcode"];

  const isAuth = await checkPasscode(passcode);
  if (!isAuth) {
    return res.status(403).json({ error: "Access Denied: Incorrect teacher passcode." });
  }

  if (!className || !teacher_name) {
    return res.status(400).json({ error: "Class name and teacher name are required." });
  }

  try {
    const formattedClass = className.trim().toUpperCase();
    const { data, error } = await supabase
      .from("sanCodeClassTeachers")
      .upsert({
        class: formattedClass,
        teacher_name: teacher_name.trim().toUpperCase(),
        email: email || null,
        phone: phone || null,
        grade: grade || formattedClass.replace(/[^0-9]/g, ""),
        academic_year: "2026",
        updated_at: new Date()
      }, { onConflict: "class" })
      .select()
      .single();

    if (error) throw error;
    res.status(200).json({ status: "success", message: "Class teacher updated successfully.", classTeacher: data });
  } catch (err) {
    console.error("Error in updateClassTeacher:", err.message);
    res.status(500).json({ error: "Failed to update class teacher." });
  }
};

// GET /classes - returns all unique student classes from sanCodeStudent
const getAllClasses = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from(studentTableName)
      .select("class");

    if (error) throw error;

    const classSet = new Set();
    (data || []).forEach(r => {
      if (r.class && r.class.trim()) {
        classSet.add(r.class.trim());
      }
    });

    const sortedClasses = Array.from(classSet).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    res.status(200).json(sortedClasses);
  } catch (err) {
    console.error("Error in getAllClasses:", err.message);
    res.status(500).json({ error: "Failed to fetch classes." });
  }
};

module.exports = {
  getAllClassTeachers,
  getClassDetails,
  updateClassTeacher,
  getAllClasses
};
