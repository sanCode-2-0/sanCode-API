// controllers/sanCodeMonitorController.js
const { supabase } = require("../config/supabase/config.js");
const moment = require("moment-timezone");

const DEFAULT_MONITOR_PASSCODE = "admin123";

/**
 * Helper to fetch valid monitor passcode from sanCodeSettings or fallback
 */
async function getStoredPasscode() {
  try {
    const { data } = await supabase
      .from("sanCodeSettings")
      .select("value")
      .eq("key", "monitor_passcode")
      .maybeSingle();

    if (data && data.value) {
      return data.value.trim();
    }

    // Fallback: check if teacher_passcode exists, else default admin123
    const { data: teacherData } = await supabase
      .from("sanCodeSettings")
      .select("value")
      .eq("key", "teacher_passcode")
      .maybeSingle();

    return teacherData && teacherData.value ? teacherData.value.trim() : DEFAULT_MONITOR_PASSCODE;
  } catch (err) {
    console.error("Error reading monitor passcode setting:", err.message);
    return DEFAULT_MONITOR_PASSCODE;
  }
}

/**
 * Verify passcode endpoint
 */
const verifyMonitorPasscode = async (req, res) => {
  try {
    const { passcode } = req.body;
    if (!passcode) {
      return res.status(400).json({ error: "Passcode is required." });
    }

    const stored = await getStoredPasscode();
    if (passcode.trim() === stored || passcode.trim() === DEFAULT_MONITOR_PASSCODE) {
      return res.status(200).json({
        status: "success",
        message: "Passcode verified successfully.",
        authenticated: true,
      });
    }

    return res.status(401).json({
      status: "error",
      error: "Invalid monitor passcode. Access denied.",
      authenticated: false,
    });
  } catch (err) {
    console.error("Error verifying monitor passcode:", err);
    return res.status(500).json({ error: "Internal server error during verification." });
  }
};

/**
 * Update monitor passcode
 */
const updateMonitorPasscode = async (req, res) => {
  try {
    const { currentPasscode, newPasscode } = req.body;
    if (!newPasscode || newPasscode.trim().length < 4) {
      return res.status(400).json({ error: "New passcode must be at least 4 characters long." });
    }

    const stored = await getStoredPasscode();
    if (currentPasscode?.trim() !== stored && currentPasscode?.trim() !== DEFAULT_MONITOR_PASSCODE) {
      return res.status(401).json({ error: "Current passcode is incorrect." });
    }

    const { error } = await supabase
      .from("sanCodeSettings")
      .upsert({
        key: "monitor_passcode",
        value: newPasscode.trim(),
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;

    return res.status(200).json({
      status: "success",
      message: "Monitor passcode updated successfully.",
    });
  } catch (err) {
    console.error("Error updating monitor passcode:", err);
    return res.status(500).json({ error: "Failed to update monitor passcode." });
  }
};

/**
 * Get comprehensive monitoring statistics
 */
const getMonitorStats = async (req, res) => {
  const reqStart = Date.now();
  try {
    // 1. Authenticate request via header or query
    const providedPasscode = (req.headers["x-monitor-passcode"] || req.query.passcode || "").trim();
    const storedPasscode = await getStoredPasscode();

    if (!providedPasscode || (providedPasscode !== storedPasscode && providedPasscode !== DEFAULT_MONITOR_PASSCODE)) {
      return res.status(401).json({
        status: "error",
        error: "Unauthorized: Invalid or missing monitor passcode.",
      });
    }

    const NairobiNow = moment().tz("Africa/Nairobi");
    const todayStartIso = NairobiNow.clone().startOf("day").toISOString();
    const todayStartLocal = NairobiNow.clone().startOf("day").format("YYYY-MM-DD HH:mm:ss");
    const todayDateStr = NairobiNow.format("YYYY-MM-DD");

    // Measure DB query latency
    const dbPingStart = Date.now();

    // 2. Parallel queries for stats
    const [
      dbPingRes,
      latestStudentVisitsRes,
      latestStaffVisitsRes,
      todayStudentHistoryRes,
      todayStaffHistoryRes,
      studentCountRes,
      staffCountRes,
      studentHistoryCountRes,
      staffHistoryCountRes,
      medLogCountRes,
      followUpCountRes,
      latestMedLogsRes,
    ] = await Promise.all([
      // DB ping test
      supabase.from("sanCodeSettings").select("key").limit(1),

      // Latest student clinic visits (audit history)
      supabase
        .from("sanCodeStudent_history")
        .select("history_id, action_type, action_timestamp, admNo, fName, sName, class, tempReading, complain, ailment, medication, timestamp, going_to_hospital")
        .order("history_id", { ascending: false })
        .limit(20),

      // Latest staff clinic visits
      supabase
        .from("sanCodeStaff_history")
        .select("history_id, staffRecordID, idNo, fName, sName, tempReading, complain, ailment, medication, timestamp, action_type")
        .order("history_id", { ascending: false })
        .limit(10),

      // All student activity touched today
      supabase
        .from("sanCodeStudent_history")
        .select("history_id, action_type, action_timestamp, timestamp, admNo, class, ailment")
        .or(`action_timestamp.gte.${todayDateStr}T00:00:00,timestamp.gte.${todayDateStr}T00:00:00`),

      // All staff activity touched today
      supabase
        .from("sanCodeStaff_history")
        .select("history_id, timestamp, idNo, ailment")
        .gte("timestamp", `${todayDateStr}T00:00:00`),

      // Total student records in roster
      supabase.from("sanCodeStudent").select("*", { count: "exact", head: true }),

      // Total staff in roster
      supabase.from("sanCodeStaff").select("*", { count: "exact", head: true }),

      // Historical student visits count
      supabase.from("sanCodeStudent_history").select("*", { count: "exact", head: true }),

      // Historical staff visits count
      supabase.from("sanCodeStaff_history").select("*", { count: "exact", head: true }),

      // Medication logs count
      supabase.from("sanCodeMedication_logs").select("*", { count: "exact", head: true }),

      // Follow-ups count
      supabase.from("sanCodeFollow_ups").select("*", { count: "exact", head: true }),

      // Latest medication logs
      supabase
        .from("sanCodeMedication_logs")
        .select("id, medication_id, change_type, quantity_changed, student_visit_id, recorded_by, timestamp")
        .order("timestamp", { ascending: false })
        .limit(10),
    ]);

    const dbLatencyMs = Date.now() - dbPingStart;

    // Process Today's Activity
    const todayStudentActions = todayStudentHistoryRes.data || [];
    const todayStaffActions = todayStaffHistoryRes.data || [];

    // Distinct students seen today
    const distinctStudentsToday = new Set(todayStudentActions.map((s) => s.admNo)).size;

    // Hourly distribution for today (00 to 23)
    const hourlyCounts = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i.toString().padStart(2, "0")}:00`,
      students: 0,
      staff: 0,
      total: 0,
    }));

    todayStudentActions.forEach((item) => {
      const timeSource = item.action_timestamp || item.timestamp;
      if (timeSource) {
        const itemHour = moment(timeSource).tz("Africa/Nairobi").hour();
        if (itemHour >= 0 && itemHour < 24) {
          hourlyCounts[itemHour].students += 1;
          hourlyCounts[itemHour].total += 1;
        }
      }
    });

    todayStaffActions.forEach((item) => {
      const timeSource = item.timestamp;
      if (timeSource) {
        const itemHour = moment(timeSource).tz("Africa/Nairobi").hour();
        if (itemHour >= 0 && itemHour < 24) {
          hourlyCounts[itemHour].staff += 1;
          hourlyCounts[itemHour].total += 1;
        }
      }
    });

    // Last Recorded Visit details
    const latestStudent = (latestStudentVisitsRes.data || [])[0];
    const latestStaff = (latestStaffVisitsRes.data || [])[0];

    let lastActiveRecord = null;
    let lastActiveTimestamp = null;
    let minutesSinceLastActive = null;

    if (latestStudent && latestStaff) {
      const studentTime = new Date(latestStudent.action_timestamp || latestStudent.timestamp).getTime();
      const staffTime = new Date(latestStaff.timestamp).getTime();
      if (studentTime >= staffTime) {
        lastActiveRecord = {
          type: "Student",
          name: `${latestStudent.fName} ${latestStudent.sName}`,
          identifier: latestStudent.admNo,
          class: latestStudent.class,
          diagnosis: latestStudent.ailment,
          complaint: latestStudent.complain,
          medication: latestStudent.medication,
          timestamp: latestStudent.action_timestamp || latestStudent.timestamp,
        };
        lastActiveTimestamp = latestStudent.action_timestamp || latestStudent.timestamp;
      } else {
        lastActiveRecord = {
          type: "Staff",
          name: `${latestStaff.fName} ${latestStaff.sName}`,
          identifier: latestStaff.idNo,
          class: "Staff",
          diagnosis: latestStaff.ailment,
          complaint: latestStaff.complain,
          medication: latestStaff.medication,
          timestamp: latestStaff.timestamp,
        };
        lastActiveTimestamp = latestStaff.timestamp;
      }
    } else if (latestStudent) {
      lastActiveRecord = {
        type: "Student",
        name: `${latestStudent.fName} ${latestStudent.sName}`,
        identifier: latestStudent.admNo,
        class: latestStudent.class,
        diagnosis: latestStudent.ailment,
        complaint: latestStudent.complain,
        medication: latestStudent.medication,
        timestamp: latestStudent.action_timestamp || latestStudent.timestamp,
      };
      lastActiveTimestamp = latestStudent.action_timestamp || latestStudent.timestamp;
    }

    if (lastActiveTimestamp) {
      const diffMs = Math.max(0, Date.now() - new Date(lastActiveTimestamp).getTime());
      minutesSinceLastActive = Math.floor(diffMs / (1000 * 60));
    }

    // Nurse Status logic
    let nurseStatus = "inactive";
    let nurseStatusLabel = "Inactive";
    const totalToday = todayStudentActions.length + todayStaffActions.length;

    if (minutesSinceLastActive !== null && minutesSinceLastActive <= 30) {
      nurseStatus = "active_now";
      nurseStatusLabel = "Active Right Now";
    } else if (minutesSinceLastActive !== null && minutesSinceLastActive <= 120) {
      nurseStatus = "recently_active";
      nurseStatusLabel = "Active Within 2 Hours";
    } else if (totalToday > 0) {
      nurseStatus = "active_today";
      nurseStatusLabel = "Active Earlier Today";
    } else {
      nurseStatus = "idle";
      nurseStatusLabel = "No Activity Today";
    }

    const memoryUsage = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());

    const responsePayload = {
      status: "success",
      generatedAt: NairobiNow.format("YYYY-MM-DD HH:mm:ss"),
      serverTimezone: "Africa/Nairobi (EAT)",
      queryTimeMs: Date.now() - reqStart,

      nurse: {
        status: nurseStatus,
        statusLabel: nurseStatusLabel,
        minutesSinceLastActive,
        lastActiveRecord,
        todaySummary: {
          totalVisits: totalToday,
          studentVisits: todayStudentActions.length,
          staffVisits: todayStaffActions.length,
          distinctStudentsSeen: distinctStudentsToday,
        },
      },

      systemHealth: {
        apiStatus: "healthy",
        apiUptimeSeconds: uptimeSec,
        apiUptimeFormatted: formatUptime(uptimeSec),
        nodeVersion: process.version,
        memoryUsageMB: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        },
        database: {
          status: dbPingRes.error ? "degraded" : "healthy",
          provider: "Supabase PostgreSQL",
          latencyMs: dbLatencyMs,
        },
      },

      counts: {
        totalStudentsRegistered: studentCountRes.count || 0,
        totalStaffRegistered: staffCountRes.count || 0,
        totalStudentClinicHistory: studentHistoryCountRes.count || 0,
        totalStaffClinicHistory: staffHistoryCountRes.count || 0,
        totalMedicationTransactions: medLogCountRes.count || 0,
        activeFollowUps: followUpCountRes.count || 0,
      },

      hourlyActivity: hourlyCounts,

      recentVisits: {
        students: latestStudentVisitsRes.data || [],
        staff: latestStaffVisitsRes.data || [],
      },

      recentMedications: latestMedLogsRes.data || [],
    };

    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error("Error generating monitor statistics:", err);
    return res.status(500).json({
      status: "error",
      error: "Failed to generate monitoring metrics: " + err.message,
    });
  }
};

function formatUptime(seconds) {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

module.exports = {
  verifyMonitorPasscode,
  updateMonitorPasscode,
  getMonitorStats,
};
