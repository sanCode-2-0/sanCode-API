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
  if (!lastVisit || !lastVisit.medication || lastVisit.medication === "null" || lastVisit.medication.trim() === "") {
    return {
      lastTakenText: "No visits logged with medication.",
      nextDueText: "No active schedule.",
      status: "NONE",
      medications: []
    };
  }

  const timestampStr = lastVisit.timestamp;
  const medicationText = lastVisit.medication.toLowerCase();
  
  const NairobiTime = moment().tz("Africa/Nairobi");
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

  // 2. Parse frequency
  let frequency = "tds"; // Default fallback
  if (medicationText.includes("stat") || medicationText.includes("start")) {
    frequency = "stat";
  } else if (medicationText.includes("prn") || medicationText.includes("as needed")) {
    frequency = "prn";
  } else if (medicationText.includes("qid") || medicationText.includes("qds")) {
    frequency = "qid";
  } else if (medicationText.includes("bd")) {
    frequency = "bd";
  } else if (medicationText.includes("od")) {
    frequency = "od";
  } else if (medicationText.includes("tds")) {
    frequency = "tds";
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
  const dateRangeMoments = [];
  const startDay = lastDoseTime.clone().startOf("day");
  const endDay = NairobiTime.clone().add(1, "day").endOf("day");

  let currentDayIter = startDay.clone();
  while (currentDayIter.isBefore(endDay)) {
    const daySlots = getSlotsForDay(currentDayIter);
    daySlots.forEach(slot => {
      const [sh, sm, ss] = slot.start_time.split(":");
      const [eh, em, es] = slot.end_time.split(":");

      const start = currentDayIter.clone().set({
        hour: parseInt(sh),
        minute: parseInt(sm),
        second: parseInt(ss || 0),
        millisecond: 0
      });

      const end = currentDayIter.clone().set({
        hour: parseInt(eh),
        minute: parseInt(em),
        second: parseInt(es || 0),
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
  // Group sorted slots by date string to apply frequency mapping rules per day
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
      // Once Daily -> First slot of the day
      if (slots[0]) mappedSlots.push(slots[0]);
    } else if (frequency === "bd") {
      // Twice Daily -> First and third slot of the day (or first and last if less than 3)
      if (slots.length === 1) {
        mappedSlots.push(slots[0]);
      } else if (slots.length === 2) {
        mappedSlots.push(slots[0], slots[1]);
      } else {
        mappedSlots.push(slots[0], slots[2] || slots[slots.length - 1]);
      }
    } else if (frequency === "tds") {
      // Three times daily -> First, second, and third slot
      mappedSlots.push(...slots.slice(0, 3));
    } else if (frequency === "qid") {
      // Four times daily -> First four slots
      mappedSlots.push(...slots.slice(0, 4));
    } else {
      mappedSlots.push(...slots);
    }
  });

  // Re-sort mapped slots chronologically
  mappedSlots.sort((a, b) => a.start.valueOf() - b.start.valueOf());

  // 6. Find which mapped slot matches or is closest to the lastTakenTime
  let lastTakenIndex = -1;
  for (let i = mappedSlots.length - 1; i >= 0; i--) {
    const slot = mappedSlots[i];
    // If lastDoseTime is close to this slot (e.g. from 1 hour before start to 2 hours after end)
    if (lastDoseTime.isBetween(slot.start.clone().subtract(1, "hour"), slot.end.clone().add(2, "hours"), null, "[]")) {
      lastTakenIndex = i;
      break;
    }
  }

  // Fallback: If no exact matching interval was found, locate the closest slot in the past relative to lastDoseTime
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
  if (lastTakenIndex !== -1 && lastTakenIndex + 1 < mappedSlots.length) {
    nextDueSlot = mappedSlots[lastTakenIndex + 1];
  } else {
    // Fallback: Find the first mapped slot that ends in the future relative to the current time
    nextDueSlot = mappedSlots.find(slot => slot.end.isAfter(NairobiTime)) || mappedSlots[mappedSlots.length - 1];
  }

  // 8. Determine compliance status and timing label
  let nextDueText = "";
  let status = "TAKEN";

  if (nextDueSlot) {
    const graceTime = nextDueSlot.end.clone().add(30, "minutes");
    const dueWindowStart = nextDueSlot.start.clone().subtract(30, "minutes");

    if (NairobiTime.isAfter(graceTime)) {
      status = "OVERDUE";
      nextDueText = `Overdue for ${nextDueSlot.name} (scheduled ${nextDueSlot.start.format("h:mm A")}).`;
    } else if (NairobiTime.isBetween(dueWindowStart, nextDueSlot.end, null, "[]")) {
      status = "DUE";
      nextDueText = `Due Now (${nextDueSlot.name} slot is open).`;
    } else {
      status = "TAKEN";
      
      // Format the relative day label
      let dayLabel = "";
      if (nextDueSlot.start.isSame(NairobiTime, "day")) {
        dayLabel = "today";
      } else if (nextDueSlot.start.isSame(NairobiTime.clone().add(1, "day"), "day")) {
        dayLabel = "tomorrow";
      } else {
        dayLabel = nextDueSlot.start.format("dddd");
      }
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
