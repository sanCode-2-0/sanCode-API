// helpers/medicationTimingHelper.js
const moment = require("moment-timezone");

/**
 * Calculates medication administration status (last taken, next due)
 * by parsing the medication text and matching it against the nurse's operating schedule slots.
 * 
 * @param {Object} lastVisit - The student's latest visit record
 * @param {Array} scheduleSlots - Nurse schedule slots from DB
 * @returns {Object} { lastTakenText, nextDueText, status, medications }
 */
function calculateMedicationTiming(lastVisit, scheduleSlots = []) {
  const NairobiTime = moment().tz("Africa/Nairobi");

  const medicationTextClean = lastVisit?.medication ? lastVisit.medication.trim().toLowerCase() : "";
  if (
    !lastVisit ||
    !lastVisit.medication ||
    lastVisit.medication === "null" ||
    medicationTextClean === "" ||
    medicationTextClean === "none" ||
    medicationTextClean === "nil" ||
    medicationTextClean === "n/a" ||
    medicationTextClean === "no medication"
  ) {
    return {
      lastTakenText: "No active medication.",
      nextDueText: "No active schedule.",
      status: "NONE",
      medications: []
    };
  }

  const timestampStr = lastVisit.timestamp;
  const medicationText = lastVisit.medication.toLowerCase();
  const lastDoseTime = moment(timestampStr).tz("Africa/Nairobi");

  // 1. Determine relative text for last taken
  let lastTakenText = "";
  if (lastDoseTime.isSame(NairobiTime, "day")) {
    lastTakenText = `Today at ${lastDoseTime.format("h:mm A")}`;
  } else if (lastDoseTime.isSame(NairobiTime.clone().subtract(1, "day"), "day")) {
    lastTakenText = `Yesterday at ${lastDoseTime.format("h:mm A")}`;
  } else {
    lastTakenText = `${lastDoseTime.format("MMM Do")} at ${lastDoseTime.format("h:mm A")}`;
  }

  // 2. Parse frequency using word-boundary regular expressions
  let frequency = "tds"; // Default fallback
  if (/\b(stat|start|once)\b/.test(medicationText)) {
    frequency = "stat";
  } else if (/\b(prn|as\s+needed)\b/.test(medicationText)) {
    frequency = "prn";
  } else if (/\b(qid|qds|4\s*x|four\s+times|4\s+times)\b/.test(medicationText)) {
    frequency = "qid";
  } else if (/\b(tds|3\s*x|three\s+times|3\s+times)\b/.test(medicationText)) {
    frequency = "tds";
  } else if (/\b(bd|2\s*x|twice|two\s+times|2\s+times)\b/.test(medicationText)) {
    frequency = "bd";
  } else if (/\b(od|1\s*x|daily|once\s+daily|1\s+time)\b/.test(medicationText)) {
    frequency = "od";
  }

  // Parse list of medicines for clean mapping
  const medications = lastVisit.medication.split(",").map(m => m.trim().toUpperCase());

  if (frequency === "stat") {
    return {
      lastTakenText,
      nextDueText: "Dose completed (one-time administration).",
      status: "COMPLETED",
      medications
    };
  }

  if (frequency === "prn") {
    return {
      lastTakenText,
      nextDueText: "Take as needed (PRN).",
      status: "AS_NEEDED",
      medications
    };
  }

  // 3. Fallback default slots if schedule slots are empty
  const defaultTimeSlots = [
    { start_time: "07:00:00", end_time: "08:00:00", slot_name: "Morning Medicine" },
    { start_time: "12:30:00", end_time: "14:00:00", slot_name: "Lunch Time Medicine" },
    { start_time: "16:00:00", end_time: "17:30:00", slot_name: "Evening Medicine" },
    { start_time: "20:00:00", end_time: "21:30:00", slot_name: "After Preps Medicine" }
  ];

  // Helper to filter slots matching day_of_week, falling back to defaults if none exist
  function getSlotsForDay(targetMoment) {
    const dayName = targetMoment.format("dddd");
    let slots = scheduleSlots.filter(s => s.day_of_week.toLowerCase() === dayName.toLowerCase());
    if (slots.length === 0) {
      slots = defaultTimeSlots.map(s => ({ ...s, day_of_week: dayName }));
    }
    return slots;
  }

  // 4. Generate absolute moments for slots from the day of the last dose to tomorrow
  // Cap startDay to be at most 5 days ago to prevent performance issues with very old visits
  const fiveDaysAgo = NairobiTime.clone().subtract(5, "days").startOf("day");
  const startDay = lastDoseTime.isBefore(fiveDaysAgo) ? fiveDaysAgo : lastDoseTime.clone().startOf("day");
  const endDay = NairobiTime.clone().add(1, "day").endOf("day");

  const dateRangeMoments = [];
  let currentDayIter = startDay.clone();
  while (currentDayIter.isBefore(endDay)) {
    const daySlots = getSlotsForDay(currentDayIter);
    daySlots.forEach(slot => {
      const [sh, sm, ss] = (slot.start_time || "00:00:00").split(":");
      const [eh, em, es] = (slot.end_time || "00:00:00").split(":");

      const start = currentDayIter.clone().set({
        hour: parseInt(sh) || 0,
        minute: parseInt(sm) || 0,
        second: parseInt(ss) || 0,
        millisecond: 0
      });

      const end = currentDayIter.clone().set({
        hour: parseInt(eh) || 0,
        minute: parseInt(em) || 0,
        second: parseInt(es) || 0,
        millisecond: 0
      });

      dateRangeMoments.push({
        name: slot.slot_name,
        start,
        end
      });
    });
    currentDayIter.add(1, "day");
  }

  // Sort slots chronologically
  dateRangeMoments.sort((a, b) => a.start.valueOf() - b.start.valueOf());

  // 5. Select active slots per day matching the prescribed frequency
  const groupedByDate = {};
  dateRangeMoments.forEach(slot => {
    const dateKey = slot.start.format("YYYY-MM-DD");
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
    groupedByDate[dateKey].push(slot);
  });

  const mappedSlots = [];
  Object.keys(groupedByDate).sort().forEach(dateKey => {
    const slots = groupedByDate[dateKey].sort((a, b) => a.start.valueOf() - b.start.valueOf());
    
    if (frequency === "od") {
      if (slots[0]) mappedSlots.push(slots[0]);
    } else if (frequency === "bd") {
      if (slots.length === 1) {
        mappedSlots.push(slots[0]);
      } else if (slots.length === 2) {
        mappedSlots.push(slots[0], slots[1]);
      } else {
        mappedSlots.push(slots[0], slots[2] || slots[slots.length - 1]);
      }
    } else if (frequency === "tds") {
      mappedSlots.push(...slots.slice(0, 3));
    } else if (frequency === "qid") {
      mappedSlots.push(...slots.slice(0, 4));
    } else {
      mappedSlots.push(...slots);
    }
  });

  mappedSlots.sort((a, b) => a.start.valueOf() - b.start.valueOf());

  // 6. Find which mapped slot matches or is closest to the lastTakenTime
  let lastTakenIndex = -1;
  for (let i = mappedSlots.length - 1; i >= 0; i--) {
    const slot = mappedSlots[i];
    if (lastDoseTime.isBetween(slot.start.clone().subtract(1, "hour"), slot.end.clone().add(2, "hours"), null, "[]")) {
      lastTakenIndex = i;
      break;
    }
  }

  if (lastTakenIndex === -1) {
    for (let i = mappedSlots.length - 1; i >= 0; i--) {
      if (lastDoseTime.isAfter(mappedSlots[i].start)) {
        lastTakenIndex = i;
        break;
      }
    }
  }

  // 7. Find next due slot
  let nextDueSlot = null;
  const potentialSlots = lastTakenIndex !== -1 ? mappedSlots.slice(lastTakenIndex + 1) : mappedSlots;

  if (potentialSlots.length > 0) {
    const lastStartedSlot = [...potentialSlots].reverse().find(slot => {
      const dueWindowStart = slot.start.clone().subtract(30, "minutes");
      return NairobiTime.isAfter(dueWindowStart);
    });

    if (lastStartedSlot) {
      nextDueSlot = lastStartedSlot;
    } else {
      nextDueSlot = potentialSlots[0];
    }
  } else {
    nextDueSlot = mappedSlots[mappedSlots.length - 1];
  }

  // 8. Determine compliance status and timing label
  let nextDueText = "";
  let status = "TAKEN";

  if (nextDueSlot) {
    const graceTime = nextDueSlot.end.clone().add(30, "minutes");
    const dueWindowStart = nextDueSlot.start.clone().subtract(30, "minutes");

    // Format the relative day label
    let dayLabel = "";
    if (nextDueSlot.start.isSame(NairobiTime, "day")) {
      dayLabel = "today";
    } else if (nextDueSlot.start.isSame(NairobiTime.clone().subtract(1, "day"), "day")) {
      dayLabel = "yesterday";
    } else if (nextDueSlot.start.isSame(NairobiTime.clone().add(1, "day"), "day")) {
      dayLabel = "tomorrow";
    } else {
      dayLabel = nextDueSlot.start.format("dddd");
    }

    if (NairobiTime.isAfter(graceTime)) {
      status = "OVERDUE";
      nextDueText = `Overdue for ${nextDueSlot.name} (scheduled ${dayLabel} at ${nextDueSlot.start.format("h:mm A")}).`;
    } else if (NairobiTime.isBetween(dueWindowStart, graceTime, null, "[]")) {
      status = "DUE";
      nextDueText = `Due Now (${nextDueSlot.name} slot is open).`;
    } else {
      status = "TAKEN";
      nextDueText = `Next due ${dayLabel} at ${nextDueSlot.start.format("h:mm A")} (${nextDueSlot.name}).`;
    }
  }

  return {
    lastTakenText,
    nextDueText,
    status,
    medications
  };
}


module.exports = {
  calculateMedicationTiming
};
