const { supabase } = require("../config/supabase/config.js");
const { reportTableName, studentTableName, staffTableName } = require("../config/database.js");
const moment = require("moment-timezone");

// Simple in-memory cache for monthly trend aggregates (2-minute TTL)
let monthlyCache = null;
let monthlyCacheExpiry = 0;

const getAnalyticsData = async (req, res) => {
  try {
    const NairobiTime = moment().tz("Africa/Nairobi");
    
    // --- 1. TODAY STATS CUTOFFS ---
    const recentCutoff = NairobiTime.clone().subtract(1, "day").set({ hour: 6, minute: 0, second: 0, millisecond: 0 }).format("YYYY-MM-DD HH:mm:ss");
    const todayCutoff = NairobiTime.clone().startOf("day").format("YYYY-MM-DD HH:mm:ss");
    const monthStart = NairobiTime.clone().startOf("month").format("YYYY-MM-DD HH:mm:ss");
    
    // Fetch both student history and current student records since recentCutoff
    const [historyResult, currentResult] = await Promise.all([
      supabase
        .from("sanCodeStudent_history")
        .select("admNo, fName, sName, class, timestamp, ailment, medication")
        .gte("timestamp", recentCutoff)
        .neq("ailment", ""),
      supabase
        .from(studentTableName)
        .select("admNo, fName, sName, class, timestamp, ailment, medication")
        .gte("timestamp", recentCutoff)
        .neq("ailment", "")
    ]);

    if (historyResult.error || currentResult.error) {
      console.error("Error fetching recent visits:", historyResult.error || currentResult.error);
      return res.status(500).json({ error: "Error fetching recent stats" });
    }

    // Combine and deduplicate
    const allVisits = [...(historyResult.data || []), ...(currentResult.data || [])];
    const seen = new Set();
    const recentVisits = [];
    for (const v of allVisits) {
      const key = `${v.admNo}_${v.timestamp}`;
      if (!seen.has(key)) {
        seen.add(key);
        recentVisits.push(v);
      }
    }
    recentVisits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Filter today's records
    const todayVisits = recentVisits.filter(r => r.timestamp >= todayCutoff);

    // Unique students seen
    const uniqueStudentsRecent = [...new Set(recentVisits.map(r => r.admNo))];
    const uniqueStudentsToday = [...new Set(todayVisits.map(r => r.admNo))];

    // Last 5 patients (recent visits)
    const recentPatients = recentVisits.slice(0, 5).map(r => ({
      admNo: r.admNo,
      fName: r.fName,
      sName: r.sName,
      class: r.class,
      timestamp: r.timestamp
    }));

    // Outbreak detection
    const ailmentCounts = {};
    recentVisits.forEach((record) => {
      const ailment = record.ailment?.toLowerCase() || "unknown";
      ailmentCounts[ailment] = (ailmentCounts[ailment] || 0) + 1;
    });
    const outbreaks = Object.entries(ailmentCounts)
      .filter(([, count]) => count >= 3)
      .map(([ailment, count]) => {
        const classBreakdown = {};
        recentVisits.forEach((r) => {
          if (r.ailment?.toLowerCase() === ailment) {
            const cls = r.class || "Unknown";
            classBreakdown[cls] = (classBreakdown[cls] || 0) + 1;
          }
        });
        return { ailment, count, classBreakdown };
      });

    // Medication due (last visit between 5am and 12pm, and hasn't returned since, checked if time >= 12pm)
    const medicationDue = [];
    const currentHour = NairobiTime.hour();
    if (currentHour >= 12) {
      const studentLastVisit = {};
      todayVisits.forEach((record) => {
        const existing = studentLastVisit[record.admNo];
        if (!existing || new Date(record.timestamp) > new Date(existing.timestamp)) {
          studentLastVisit[record.admNo] = record;
        }
      });
      Object.values(studentLastVisit).forEach((record) => {
        const recordTime = moment(record.timestamp).tz("Africa/Nairobi");
        const hour = recordTime.hour();
        if (hour >= 5 && hour < 12 && record.medication) {
          medicationDue.push(record);
        }
      });
    }

    const todayStats = {
      studentCount: uniqueStudentsRecent.length,
      studentCountToday: uniqueStudentsToday.length,
      totalVisits: recentVisits.length,
      totalVisitsToday: todayVisits.length,
      recentPatients,
      outbreaks,
      medicationDue
    };

    // --- 2. MONTH OVERVIEW STATS (student history + staff history) ---
    const now = Date.now();
    let computed = null;
    let reportData = null;

    if (monthlyCache && now < monthlyCacheExpiry) {
      computed = monthlyCache.computed;
      reportData = monthlyCache.reportData;
    } else {
      // Fetch all student and staff history and current records since start of month
      const [studentHistoryResult, studentCurrentResult, staffHistoryResult, staffCurrentResult] = await Promise.all([
        supabase
          .from("sanCodeStudent_history")
          .select("timestamp, admNo, ailment, class")
          .gte("timestamp", monthStart)
          .neq("ailment", ""),
        supabase
          .from(studentTableName)
          .select("timestamp, admNo, ailment, class")
          .gte("timestamp", monthStart)
          .neq("ailment", ""),
        supabase
          .from("sanCodeStaff_history")
          .select("timestamp, ailment, idNo")
          .gte("timestamp", monthStart)
          .neq("ailment", ""),
        supabase
          .from(staffTableName)
          .select("timestamp, ailment, idNo")
          .gte("timestamp", monthStart)
          .neq("ailment", "")
      ]);

      if (
        studentHistoryResult.error ||
        studentCurrentResult.error ||
        staffHistoryResult.error ||
        staffCurrentResult.error
      ) {
        console.error(
          "Error fetching monthly history:",
          studentHistoryResult.error ||
            studentCurrentResult.error ||
            staffHistoryResult.error ||
            staffCurrentResult.error
        );
        return res.status(500).json({ error: "Error fetching history data" });
      }

      // Combine and deduplicate student records
      const allStudentMonth = [...(studentHistoryResult.data || []), ...(studentCurrentResult.data || [])];
      const studentSeen = new Set();
      const studentMonthVisits = [];
      for (const r of allStudentMonth) {
        const key = `${r.admNo}_${r.timestamp}`;
        if (!studentSeen.has(key)) {
          studentSeen.add(key);
          studentMonthVisits.push(r);
        }
      }

      // Combine and deduplicate staff records
      const allStaffMonth = [...(staffHistoryResult.data || []), ...(staffCurrentResult.data || [])];
      const staffSeen = new Set();
      const staffMonthVisits = [];
      for (const r of allStaffMonth) {
        const key = `${r.idNo}_${r.timestamp}`;
        if (!staffSeen.has(key)) {
          staffSeen.add(key);
          staffMonthVisits.push(r);
        }
      }

      // Peak hours (this month, student visits)
      const peakHoursBuckets = new Array(24).fill(0);
      studentMonthVisits.forEach(r => {
        const hour = moment(r.timestamp).tz("Africa/Nairobi").hour();
        peakHoursBuckets[hour]++;
      });
      const peakHours = peakHoursBuckets.map((count, hour) => ({ hour, count }));

      // Readmissions (student returns within 7 days for same ailment)
      const groups = {};
      studentMonthVisits.forEach(r => {
        const ailment = (r.ailment || "").toLowerCase();
        if (!ailment) return;
        const key = `${r.admNo}__${ailment}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      });
      const readmissionsList = [];
      Object.values(groups).forEach(visits => {
        if (visits.length < 2) return;
        visits.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        for (let i = 1; i < visits.length; i++) {
          const prev = new Date(visits[i - 1].timestamp);
          const curr = new Date(visits[i].timestamp);
          const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
          if (diffDays >= 1 && diffDays <= 7) {
            readmissionsList.push({
              admNo: visits[i].admNo,
              ailment: visits[i].ailment,
              firstVisit: visits[i - 1].timestamp,
              returnVisit: visits[i].timestamp,
              daysBetween: diffDays,
            });
          }
        }
      });
      const readmissions = readmissionsList.sort((a, b) => new Date(b.returnVisit) - new Date(a.returnVisit));

      // Attendance impact (unique student-days affected this week/month + chronic students)
      const thisWeekStart = NairobiTime.clone().startOf("week").format("YYYY-MM-DD HH:mm:ss");
      const weekDays = new Set();
      const monthDays = new Set();
      const monthVisitsByStudent = {};
      studentMonthVisits.forEach(r => {
        const d = moment(r.timestamp).tz("Africa/Nairobi");
        const dateStr = d.format("YYYY-MM-DD");
        const key = `${r.admNo}_${dateStr}`;
        monthDays.add(key);
        monthVisitsByStudent[r.admNo] = (monthVisitsByStudent[r.admNo] || 0) + 1;
        if (r.timestamp >= thisWeekStart) {
          weekDays.add(key);
        }
      });
      const chronicStudents = Object.entries(monthVisitsByStudent)
        .filter(([, count]) => count >= 3)
        .map(([admNo, count]) => ({ admNo: Number(admNo), count }))
        .sort((a, b) => b.count - a.count);
      const attendanceImpact = {
        weekStudentDays: weekDays.size,
        monthStudentDays: monthDays.size,
        chronicStudents
      };

      // Weekly comparison (this week vs last week)
      const lastWeekStart = NairobiTime.clone().subtract(1, "week").startOf("week").format("YYYY-MM-DD HH:mm:ss");
      const lastWeekEnd = thisWeekStart;
      const thisWeekRecords = studentMonthVisits.filter(r => r.timestamp >= thisWeekStart);
      
      // Fetch last week records from both history and current tables
      const [lastWeekHistResult, lastWeekCurrentResult] = await Promise.all([
        supabase
          .from("sanCodeStudent_history")
          .select("admNo, timestamp")
          .gte("timestamp", lastWeekStart)
          .lt("timestamp", lastWeekEnd)
          .neq("ailment", ""),
        supabase
          .from(studentTableName)
          .select("admNo, timestamp")
          .gte("timestamp", lastWeekStart)
          .lt("timestamp", lastWeekEnd)
          .neq("ailment", "")
      ]);

      const lastWeekRecords = [];
      const lastWeekSeen = new Set();
      const allLastWeek = [
        ...(lastWeekHistResult.error ? [] : lastWeekHistResult.data || []),
        ...(lastWeekCurrentResult.error ? [] : lastWeekCurrentResult.data || [])
      ];
      for (const r of allLastWeek) {
        const key = `${r.admNo}_${r.timestamp}`;
        if (!lastWeekSeen.has(key)) {
          lastWeekSeen.add(key);
          lastWeekRecords.push(r);
        }
      }
      const weeklyComparison = {
        thisWeek: {
          visits: thisWeekRecords.length,
          uniqueStudents: new Set(thisWeekRecords.map(r => r.admNo)).size
        },
        lastWeek: {
          visits: lastWeekRecords.length,
          uniqueStudents: new Set(lastWeekRecords.map(r => r.admNo)).size
        },
        percentChange: lastWeekRecords.length > 0
          ? Math.round(((thisWeekRecords.length - lastWeekRecords.length) / lastWeekRecords.length) * 100)
          : null
      };

      // Class breakdown (student records this month grouped by class)
      const classStats = {};
      studentMonthVisits.forEach(r => {
        const cls = r.class || "Unknown";
        if (!classStats[cls]) {
          classStats[cls] = {
            className: cls,
            visits: 0,
            uniqueStudents: new Set(),
            ailments: {}
          };
        }
        classStats[cls].visits++;
        classStats[cls].uniqueStudents.add(r.admNo);
        const ailment = (r.ailment || "unknown").toLowerCase();
        classStats[cls].ailments[ailment] = (classStats[cls].ailments[ailment] || 0) + 1;
      });
      const classBreakdown = Object.values(classStats)
        .map(c => ({
          className: c.className,
          visits: c.visits,
          uniqueStudents: c.uniqueStudents.size,
          topAilment: Object.entries(c.ailments).sort((a, b) => b[1] - a[1])[0]?.[0] || "-"
        }))
        .sort((a, b) => b.visits - a.visits);

      // --- 3. REPORT DATA & PRE-COMPUTED METRICS ---
      const { data: fetchedReportData, error: reportError } = await supabase
        .from(reportTableName)
        .select("*");

      if (reportError) {
        console.error("Error fetching report data:", reportError);
        return res.status(500).json({ error: "Error fetching report table" });
      }

      reportData = fetchedReportData;

      // Compute monthTotal from reportData
      let monthTotal = 0;
      reportData.forEach(row => {
        for (let d = 1; d <= 31; d++) {
          monthTotal += Number(row[String(d)]) || 0;
        }
      });

      // Compute topAilment from reportData
      let topAilment = null;
      reportData.forEach(row => {
        let sum = 0;
        for (let d = 1; d <= 31; d++) {
          sum += Number(row[String(d)]) || 0;
        }
        if (sum > 0 && (!topAilment || sum > topAilment.count)) {
          topAilment = { name: row.disease, count: sum };
        }
      });

      // Compute diseaseDistribution from reportData
      const diseaseTotals = reportData.map(row => {
        let sum = 0;
        for (let d = 1; d <= 31; d++) sum += Number(row[String(d)]) || 0;
        return { name: row.disease, value: sum };
      });
      const nonZeroDiseases = diseaseTotals.filter(d => d.value > 0).sort((a, b) => b.value - a.value);
      let diseaseDistribution = nonZeroDiseases;
      if (nonZeroDiseases.length > 10) {
        diseaseDistribution = nonZeroDiseases.slice(0, 10);
        const otherValue = nonZeroDiseases.slice(10).reduce((s, d) => s + d.value, 0);
        if (otherValue > 0) {
          diseaseDistribution.push({ name: "Other", value: otherValue });
        }
      }

      computed = {
        peakHours,
        readmissions,
        attendanceImpact,
        weeklyComparison,
        classBreakdown,
        monthTotal,
        topAilment,
        diseaseDistribution
      };

      // Store in memory cache (2-minute TTL)
      monthlyCache = { computed, reportData };
      monthlyCacheExpiry = now + 2 * 60 * 1000;
    }

    // --- 4. HOSPITAL REFERRALS ---
    const { data: hospitalReferrals, error: referralsError } = await supabase
      .from("sanCodeStudent")
      .select("*")
      .eq("going_to_hospital", 1);

    const referrals = referralsError ? [] : (hospitalReferrals || []);

    // --- 5. MEDICATION INVENTORY & LOGS ---
    const [invResult, batchResult, logsResult] = await Promise.all([
      supabase.from("sanCodeMedication_inventory").select("*").order("name", { ascending: true }),
      supabase.from("sanCodeMedication_batches").select("*").gt("quantity", 0).order("expiry_date", { ascending: true }),
      supabase.from("sanCodeMedication_logs").select("*").order("timestamp", { ascending: false }).limit(30)
    ]);

    const inventoryList = (invResult.data || []).map(med => {
      const medBatches = (batchResult.data || []).filter(b => b.medication_id === med.id);
      return {
        ...med,
        batches: medBatches
      };
    });
    const logsList = logsResult.data || [];

    // Return the response!
    res.status(200).json({
      reportData,
      todayStats,
      computed,
      hospitalReferrals: referrals,
      medicationInventory: inventoryList,
      medicationLogs: logsList
    });
  } catch (err) {
    console.error("Error in getAnalyticsData:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
};

module.exports = {
  getAnalyticsData
};
