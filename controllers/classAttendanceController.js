const { supabase } = require("../config/supabase/config.js");
const { studentTableName } = require("../config/database.js");
const { Client } = require("pg");
const moment = require("moment-timezone");

// Passcode helper
async function checkPasscode(passcode) {
  if (!passcode) return false;
  const { data: configData, error } = await supabase
    .from("sanCodeSettings")
    .select("value")
    .eq("key", "teacher_passcode")
    .maybeSingle();

  if (error) return false;
  const dbPasscode = configData ? configData.value : "staff123";
  return passcode.trim() === dbPasscode.trim();
}

function getPgClient() {
  return new Client({
    connectionString: "postgresql://postgres.hqaaeofsktwmuiybldpe:" + encodeURIComponent(process.env.SUPABASE_PASSWORD) + "@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
  });
}

// GET /class-attendance/:className
const getClassAttendance = async (req, res) => {
  const { className } = req.params;
  const passcode = req.query.passcode || req.headers["x-teacher-passcode"];
  const dateParam = req.query.date; // YYYY-MM-DD
  const sessionParam = (req.query.session || "daily").toLowerCase();

  const isAuth = await checkPasscode(passcode);
  if (!isAuth) {
    return res.status(403).json({ error: "Access Denied: Incorrect teacher passcode." });
  }

  if (!className) {
    return res.status(400).json({ error: "Class name is required." });
  }

  const formattedClass = className.trim().toUpperCase();
  const targetDate = dateParam && moment(dateParam, "YYYY-MM-DD", true).isValid()
    ? dateParam
    : moment().tz("Africa/Nairobi").format("YYYY-MM-DD");

  const todayStart = moment(targetDate).startOf("day").format("YYYY-MM-DD HH:mm:ss");
  const todayEnd = moment(targetDate).endOf("day").format("YYYY-MM-DD HH:mm:ss");

  const pgClient = getPgClient();

  try {
    await pgClient.connect();

    // 1. Fetch class teacher info
    const teacherRes = await pgClient.query(
      'SELECT teacher_name FROM "sanCodeClassTeachers" WHERE class = $1',
      [formattedClass]
    );
    const teacherName = teacherRes.rows[0]?.teacher_name || "Class Teacher";

    // 2. Fetch class students
    const { data: students, error: studErr } = await supabase
      .from(studentTableName)
      .select("admNo, fName, sName, tName, fourthName, class, house, going_to_hospital")
      .eq("class", formattedClass)
      .order("fName", { ascending: true });

    if (studErr) throw studErr;

    const classAdmNos = (students || []).map(s => s.admNo);

    // 3. Fetch attendance records for this class and date
    const attRes = await pgClient.query(
      'SELECT adm_no, status, remarks, taken_by, updated_at, is_completed FROM "sanCodeClassAttendance" WHERE class = $1 AND date = $2',
      [formattedClass, targetDate]
    );

    const attMap = new Map();
    let takenBy = null;
    let updatedAt = null;
    let isCompleted = true;

    attRes.rows.forEach(r => {
      attMap.set(r.adm_no, r);
      if (!takenBy && r.taken_by) takenBy = r.taken_by;
      if (!updatedAt && r.updated_at) updatedAt = r.updated_at;
      if (r.is_completed === false) isCompleted = false;
    });

    const isSubmitted = attRes.rows.length > 0;

    // 4. Fetch clinic visits for this day to inform the teacher
    const clinicVisitsMap = new Map();
    if (classAdmNos.length > 0) {
      const [histRes, activeRes] = await Promise.all([
        supabase
          .from("sanCodeStudent_history")
          .select("admNo, complain, ailment, medication, going_to_hospital, timestamp")
          .in("admNo", classAdmNos)
          .gte("timestamp", todayStart)
          .lte("timestamp", todayEnd)
          .neq("ailment", ""),
        supabase
          .from(studentTableName)
          .select("admNo, complain, ailment, medication, going_to_hospital, timestamp")
          .in("admNo", classAdmNos)
          .gte("timestamp", todayStart)
          .lte("timestamp", todayEnd)
          .neq("ailment", "")
      ]);

      const allVisits = [...(activeRes.data || []), ...(histRes.data || [])];
      allVisits.forEach(v => {
        if (!clinicVisitsMap.has(v.admNo)) {
          clinicVisitsMap.set(v.admNo, v);
        }
      });
    }

    // 5. Combine student roster with attendance & clinic status
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let medicalCount = 0;
    let excusedCount = 0;

    const roster = (students || []).map(s => {
      const record = attMap.get(s.admNo);
      const clinicVisit = clinicVisitsMap.get(s.admNo);

      // Default status
      const status = record ? record.status : "present";
      const remarks = record ? record.remarks : (clinicVisit ? "At Sanatorium" : "");

      if (isSubmitted) {
        if (status === "present") presentCount++;
        else if (status === "absent") absentCount++;
        else if (status === "late") lateCount++;
        else if (status === "medical") medicalCount++;
        else if (status === "excused") excusedCount++;
      }

      return {
        admNo: s.admNo,
        fullName: [s.fName, s.sName, s.tName, s.fourthName].filter(Boolean).join(" "),
        house: s.house || "—",
        status,
        remarks: remarks || "",
        clinicVisitToday: !!clinicVisit,
        clinicDetails: clinicVisit || null,
        isHospitalReferred: s.going_to_hospital === 1 || clinicVisit?.going_to_hospital === 1
      };
    });

    res.status(200).json({
      status: "success",
      className: formattedClass,
      date: targetDate,
      session: sessionParam,
      teacherName,
      isSubmitted,
      isCompleted: isSubmitted ? isCompleted : null,
      takenBy,
      updatedAt,
      metrics: {
        total: roster.length,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        medical: medicalCount,
        excused: excusedCount,
        attendanceRate: roster.length > 0 && isSubmitted ? Math.round((presentCount / roster.length) * 100) : 0
      },
      roster
    });

  } catch (err) {
    console.error("Error in getClassAttendance:", err.message);
    res.status(500).json({ error: "Failed to fetch class attendance register." });
  } finally {
    await pgClient.end();
  }
};

// POST /class-attendance/:className
const saveClassAttendance = async (req, res) => {
  const { className } = req.params;
  const passcode = req.query.passcode || req.headers["x-teacher-passcode"];
  const { date, session, records, taken_by, is_completed } = req.body;

  const isAuth = await checkPasscode(passcode);
  if (!isAuth) {
    return res.status(403).json({ error: "Access Denied: Incorrect teacher passcode." });
  }

  if (!className || !date || !records || !Array.isArray(records)) {
    return res.status(400).json({ error: "Missing required fields: className, date, and records array." });
  }

  const formattedClass = className.trim().toUpperCase();
  const sessionVal = (session || "daily").toLowerCase();
  const completedFlag = is_completed !== false; // defaults to true
  const pgClient = getPgClient();

  try {
    await pgClient.connect();

    await pgClient.query("BEGIN");

    for (const r of records) {
      const admNo = Number(r.admNo);
      const status = (r.status || "present").toLowerCase();
      const remarks = r.remarks ? String(r.remarks).trim() : null;

      await pgClient.query(`
        INSERT INTO "sanCodeClassAttendance" (class, date, session, adm_no, status, remarks, taken_by, is_completed, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (class, date, session, adm_no) DO UPDATE
        SET status = EXCLUDED.status,
            remarks = EXCLUDED.remarks,
            taken_by = EXCLUDED.taken_by,
            is_completed = EXCLUDED.is_completed,
            updated_at = NOW();
      `, [formattedClass, date, sessionVal, admNo, status, remarks, taken_by || null, completedFlag]);
    }

    await pgClient.query("COMMIT");

    res.status(200).json({
      status: "success",
      message: `Attendance register saved for ${formattedClass} (${records.length} students).`,
      savedCount: records.length,
      date,
      session: sessionVal,
      is_completed: completedFlag
    });

  } catch (err) {
    await pgClient.query("ROLLBACK");
    console.error("Error saving class attendance:", err.message);
    res.status(500).json({ error: "Failed to save attendance register." });
  } finally {
    await pgClient.end();
  }
};

// GET /class-attendance/:className/history
const getClassAttendanceHistory = async (req, res) => {
  const { className } = req.params;
  const passcode = req.query.passcode || req.headers["x-teacher-passcode"];
  const monthParam = req.query.month; // YYYY-MM

  const isAuth = await checkPasscode(passcode);
  if (!isAuth) {
    return res.status(403).json({ error: "Access Denied: Incorrect teacher passcode." });
  }

  const formattedClass = className.trim().toUpperCase();
  const targetMonth = monthParam || moment().tz("Africa/Nairobi").format("YYYY-MM");
  const monthStart = moment(targetMonth + "-01").startOf("month").format("YYYY-MM-DD");
  const monthEnd = moment(targetMonth + "-01").endOf("month").format("YYYY-MM-DD");

  const pgClient = getPgClient();

  try {
    await pgClient.connect();

    const query = `
      SELECT 
        date, 
        COUNT(*) as total_records,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late_count,
        SUM(CASE WHEN status = 'medical' THEN 1 ELSE 0 END) as medical_count,
        SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END) as excused_count,
        BOOL_AND(COALESCE(is_completed, true)) as is_completed,
        MAX(taken_by) as taken_by,
        MAX(updated_at) as last_updated
      FROM "sanCodeClassAttendance"
      WHERE class = $1 AND date >= $2 AND date <= $3
      GROUP BY date
      ORDER BY date DESC;
    `;

    const result = await pgClient.query(query, [formattedClass, monthStart, monthEnd]);

    res.status(200).json({
      status: "success",
      className: formattedClass,
      month: targetMonth,
      history: result.rows
    });

  } catch (err) {
    console.error("Error fetching attendance history:", err.message);
    res.status(500).json({ error: "Failed to fetch attendance history." });
  } finally {
    await pgClient.end();
  }
};

module.exports = {
  getClassAttendance,
  saveClassAttendance,
  getClassAttendanceHistory
};
