// controllers/sanCodeScheduleController.js
const { supabase } = require("../config/supabase/config.js");
const moment = require("moment-timezone");

// 1. Settings / Passcode
const getTeacherPasscode = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("sanCodeSettings")
      .select("value")
      .eq("key", "teacher_passcode")
      .maybeSingle();

    if (error) throw error;

    const passcode = data ? data.value : "staff123"; // fallback
    res.status(200).json({ passcode });
  } catch (err) {
    console.error("Error fetching passcode:", err.message);
    res.status(500).json({ error: "Failed to fetch teacher passcode" });
  }
};

const updateTeacherPasscode = async (req, res) => {
  const { passcode } = req.body;
  if (!passcode) {
    return res.status(400).json({ error: "Passcode cannot be empty." });
  }

  try {
    const { error } = await supabase
      .from("sanCodeSettings")
      .upsert({ key: "teacher_passcode", value: passcode.trim(), updated_at: new Date() });

    if (error) throw error;

    res.status(200).json({ status: "success", message: "Teacher passcode updated successfully." });
  } catch (err) {
    console.error("Error updating passcode:", err.message);
    res.status(500).json({ error: "Failed to update teacher passcode" });
  }
};

// 2. Nurse Schedule Slots
const getNurseSchedule = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("sanCodeNurse_schedule")
      .select("*")
      .order("day_of_week")
      .order("start_time");

    if (error) throw error;
    res.status(200).json({ schedule: data || [] });
  } catch (err) {
    console.error("Error fetching schedule:", err.message);
    res.status(500).json({ error: "Failed to fetch schedule slots" });
  }
};

const addNurseScheduleSlot = async (req, res) => {
  const { dayOfWeek, startTime, endTime, slotName, description } = req.body;
  if (!dayOfWeek || !startTime || !endTime || !slotName) {
    return res.status(400).json({ error: "Missing required fields for schedule slot." });
  }

  try {
    const { data, error } = await supabase
      .from("sanCodeNurse_schedule")
      .insert([{
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        slot_name: slotName,
        description: description || ""
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(200).json({ status: "success", slot: data });
  } catch (err) {
    console.error("Error adding schedule slot:", err.message);
    res.status(500).json({ error: "Failed to create schedule slot." });
  }
};

const deleteNurseScheduleSlot = async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from("sanCodeNurse_schedule")
      .delete()
      .eq("id", id);

    if (error) throw error;
    res.status(200).json({ status: "success", message: "Schedule slot deleted successfully." });
  } catch (err) {
    console.error("Error deleting schedule slot:", err.message);
    res.status(500).json({ error: "Failed to delete schedule slot." });
  }
};

// 3. Student Follow-ups
const createFollowUp = async (req, res) => {
  const { admNo, scheduledTime, reason } = req.body;
  if (!admNo || !scheduledTime) {
    return res.status(400).json({ error: "Missing admNo or scheduledTime." });
  }

  try {
    const { data, error } = await supabase
      .from("sanCodeFollow_ups")
      .insert([{
        adm_no: Number(admNo),
        scheduled_time: scheduledTime,
        reason: reason || "",
        status: "PENDING"
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(200).json({ status: "success", followUp: data });
  } catch (err) {
    console.error("Error creating follow-up:", err.message);
    res.status(500).json({ error: "Failed to schedule follow-up." });
  }
};

const getStudentFollowUps = async (req, res) => {
  const { admNo } = req.params;
  try {
    const { data, error } = await supabase
      .from("sanCodeFollow_ups")
      .select("*")
      .eq("adm_no", Number(admNo))
      .order("scheduled_time", { ascending: true });

    if (error) throw error;
    res.status(200).json({ followUps: data || [] });
  } catch (err) {
    console.error("Error fetching student follow-ups:", err.message);
    res.status(500).json({ error: "Failed to fetch follow-ups." });
  }
};

// 4. Teacher Verification
const verifyStudentForTeacher = async (req, res) => {
  const { admNo } = req.params;
  const { passcode } = req.query;

  if (!admNo || !passcode) {
    return res.status(400).json({ error: "Missing admNo or passcode." });
  }

  try {
    // 1. Verify passcode
    const { data: configData, error: configErr } = await supabase
      .from("sanCodeSettings")
      .select("value")
      .eq("key", "teacher_passcode")
      .maybeSingle();

    if (configErr) throw configErr;
    const dbPasscode = configData ? configData.value : "staff123";

    if (passcode.trim() !== dbPasscode) {
      return res.status(403).json({ error: "Access Denied: Incorrect passcode." });
    }

    // 2. Fetch student details
    const { data: student, error: studErr } = await supabase
      .from("sanCodeStudent")
      .select("admNo, fName, sName, class, going_to_hospital, tempReading, complain, ailment, medication, timestamp")
      .eq("admNo", Number(admNo))
      .maybeSingle();

    if (studErr) throw studErr;

    if (!student) {
      return res.status(404).json({ error: "Student not found with this admission number." });
    }

    // 3. Fetch latest visits from history
    const { data: history, error: histErr } = await supabase
      .from("sanCodeStudent_history")
      .select("timestamp, ailment, complain, medication, going_to_hospital")
      .eq("admNo", Number(admNo))
      .order("timestamp", { ascending: false })
      .limit(3);

    if (histErr) throw histErr;

    // 4. Fetch pending scheduled returns / follow-ups
    const { data: followUps, error: followErr } = await supabase
      .from("sanCodeFollow_ups")
      .select("*")
      .eq("adm_no", Number(admNo))
      .eq("status", "PENDING")
      .order("scheduled_time", { ascending: true });

    if (followErr) throw followErr;

    res.status(200).json({
      status: "success",
      studentInfo: {
        admNo: student.admNo,
        fName: student.fName,
        sName: student.sName,
        class: student.class,
        going_to_hospital: student.going_to_hospital,
        lastStatusTime: student.timestamp
      },
      latestVisits: history || [],
      scheduledReturns: followUps || []
    });

  } catch (err) {
    console.error("Error in teacher verify:", err.message);
    res.status(500).json({ error: "Internal server error performing lookup." });
  }
};

module.exports = {
  getTeacherPasscode,
  updateTeacherPasscode,
  getNurseSchedule,
  addNurseScheduleSlot,
  deleteNurseScheduleSlot,
  createFollowUp,
  getStudentFollowUps,
  verifyStudentForTeacher
};
