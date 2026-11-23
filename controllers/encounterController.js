// controllers/encounterController.js
const { pool } = require("../config/pg.js");

/**
 * Explicit State Machine Constants for Clinical Encounters
 */
const ENCOUNTER_STATUS = {
  TRIAGE: "TRIAGE",
  IN_CONSULTATION: "IN_CONSULTATION",
  DISPENSED: "DISPENSED",
  REFERRED: "REFERRED",
  DISCHARGED: "DISCHARGED"
};

const REFERRAL_STATUS = {
  NONE: "NONE",
  REFERRED: "REFERRED",
  TRANSFERRED: "TRANSFERRED",
  CLEARED: "CLEARED"
};

/**
 * Valid state transition maps enforcing finite state machines
 */
const ENCOUNTER_TRANSITIONS = {
  [ENCOUNTER_STATUS.TRIAGE]: [
    ENCOUNTER_STATUS.IN_CONSULTATION,
    ENCOUNTER_STATUS.DISCHARGED
  ],
  [ENCOUNTER_STATUS.IN_CONSULTATION]: [
    ENCOUNTER_STATUS.DISPENSED,
    ENCOUNTER_STATUS.REFERRED,
    ENCOUNTER_STATUS.DISCHARGED
  ],
  [ENCOUNTER_STATUS.DISPENSED]: [
    ENCOUNTER_STATUS.REFERRED,
    ENCOUNTER_STATUS.DISCHARGED
  ],
  [ENCOUNTER_STATUS.REFERRED]: [
    ENCOUNTER_STATUS.DISCHARGED
  ],
  [ENCOUNTER_STATUS.DISCHARGED]: [] // Terminal
};

const REFERRAL_TRANSITIONS = {
  [REFERRAL_STATUS.NONE]: [REFERRAL_STATUS.REFERRED],
  [REFERRAL_STATUS.REFERRED]: [REFERRAL_STATUS.TRANSFERRED, REFERRAL_STATUS.CLEARED],
  [REFERRAL_STATUS.TRANSFERRED]: [REFERRAL_STATUS.CLEARED],
  [REFERRAL_STATUS.CLEARED]: [] // Terminal
};

/**
 * Validates whether a state transition is legal
 */
function isValidEncounterTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;
  const allowed = ENCOUNTER_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
}

function isValidReferralTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;
  const allowed = REFERRAL_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
}

/**
 * Helper to record a new clinical encounter in the dedicated encounters table
 */
async function recordClinicalEncounter({
  patientType = "STUDENT",
  patientId,
  tempReading,
  complaint,
  ailment,
  medication,
  isReferred = false,
  referralNotes = null,
  nurseEmail = "clinic-nurse",
  status = null
}) {
  if (!patientId) {
    throw new Error("patientId is required to record a clinical encounter.");
  }

  // Determine initial status based on clinical findings if status not explicitly specified
  let initialStatus = status;
  if (!initialStatus) {
    if (isReferred) {
      initialStatus = ENCOUNTER_STATUS.REFERRED;
    } else if (medication && medication.toLowerCase() !== "none") {
      initialStatus = ENCOUNTER_STATUS.DISPENSED;
    } else if (ailment) {
      initialStatus = ENCOUNTER_STATUS.DISCHARGED;
    } else {
      initialStatus = ENCOUNTER_STATUS.TRIAGE;
    }
  }

  const referralStatusVal = isReferred ? REFERRAL_STATUS.REFERRED : REFERRAL_STATUS.NONE;

  const client = await pool.connect();
  try {
    const res = await client.query(
      `INSERT INTO "sanCodeClinical_encounters" (
        patient_type,
        patient_id,
        status,
        temp_reading,
        complaint,
        ailment,
        medication,
        referral_status,
        referral_notes,
        nurse_email,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *`,
      [
        patientType.toUpperCase(),
        Number(patientId),
        initialStatus,
        tempReading ? Number(tempReading) : null,
        complaint || null,
        ailment || null,
        medication || null,
        referralStatusVal,
        referralNotes,
        nurseEmail
      ]
    );

    return res.rows[0];
  } finally {
    client.release();
  }
}

/**
 * POST /encounters
 * Creates a new encounter via the explicit REST API
 */
const createEncounter = async (req, res) => {
  const {
    patientType = "STUDENT",
    patientId,
    tempReading,
    complaint,
    ailment,
    medication,
    isReferred,
    referralNotes,
    status
  } = req.body;

  if (!patientId) {
    return res.status(400).json({ error: "Missing required field: patientId." });
  }

  try {
    const encounter = await recordClinicalEncounter({
      patientType,
      patientId,
      tempReading,
      complaint,
      ailment,
      medication,
      isReferred: !!isReferred,
      referralNotes,
      nurseEmail: req.user?.email || "clinic-nurse",
      status
    });

    res.status(201).json({
      status: "success",
      message: `Encounter created for ${patientType} ${patientId}`,
      encounter
    });
  } catch (err) {
    console.error("Error creating clinical encounter:", err.message);
    res.status(500).json({ error: "Internal server error creating clinical encounter." });
  }
};

/**
 * PATCH /encounters/:id/status
 * Transitions an encounter's clinical state
 */
const updateEncounterStatus = async (req, res) => {
  const { id } = req.params;
  const { nextStatus, notes } = req.body;

  if (!id || !nextStatus) {
    return res.status(400).json({ error: "Missing required fields: id and nextStatus." });
  }

  const targetStatus = nextStatus.toUpperCase();
  if (!Object.values(ENCOUNTER_STATUS).includes(targetStatus)) {
    return res.status(400).json({
      error: `Invalid status: ${nextStatus}. Allowed: ${Object.values(ENCOUNTER_STATUS).join(", ")}`
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Fetch current encounter with lock
    const currentRes = await client.query(
      `SELECT * FROM "sanCodeClinical_encounters" WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (currentRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Encounter not found." });
    }

    const encounter = currentRes.rows[0];

    // 2. Validate transition
    if (!isValidEncounterTransition(encounter.status, targetStatus)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: `Illegal state transition from ${encounter.status} to ${targetStatus}.`,
        currentStatus: encounter.status,
        allowedTransitions: ENCOUNTER_TRANSITIONS[encounter.status] || []
      });
    }

    // 3. Update status
    const updateRes = await client.query(
      `UPDATE "sanCodeClinical_encounters" 
       SET status = $1, 
           updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [targetStatus, id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      status: "success",
      message: `Encounter transitioned from ${encounter.status} to ${targetStatus}.`,
      previousStatus: encounter.status,
      encounter: updateRes.rows[0]
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error updating encounter status:", err.message);
    res.status(500).json({ error: "Internal server error updating encounter status." });
  } finally {
    client.release();
  }
};

/**
 * PATCH /encounters/:id/referral
 * Transitions hospital referral lifecycle (REFERRED -> TRANSFERRED -> CLEARED)
 */
const updateReferralStatus = async (req, res) => {
  const { id } = req.params;
  const { nextReferralStatus, referralNotes } = req.body;

  if (!id || !nextReferralStatus) {
    return res.status(400).json({ error: "Missing required fields: id and nextReferralStatus." });
  }

  const targetStatus = nextReferralStatus.toUpperCase();
  if (!Object.values(REFERRAL_STATUS).includes(targetStatus)) {
    return res.status(400).json({
      error: `Invalid referral status: ${nextReferralStatus}. Allowed: ${Object.values(REFERRAL_STATUS).join(", ")}`
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Fetch current encounter with lock
    const currentRes = await client.query(
      `SELECT * FROM "sanCodeClinical_encounters" WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (currentRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Encounter not found." });
    }

    const encounter = currentRes.rows[0];

    // 2. Validate referral transition
    if (!isValidReferralTransition(encounter.referral_status, targetStatus)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: `Illegal referral transition from ${encounter.referral_status} to ${targetStatus}.`,
        currentReferralStatus: encounter.referral_status,
        allowedTransitions: REFERRAL_TRANSITIONS[encounter.referral_status] || []
      });
    }

    // 3. Update referral status and notes
    const updateRes = await client.query(
      `UPDATE "sanCodeClinical_encounters" 
       SET referral_status = $1, 
           referral_notes = COALESCE($2, referral_notes),
           updated_at = NOW() 
       WHERE id = $3 
       RETURNING *`,
      [targetStatus, referralNotes || null, id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      status: "success",
      message: `Referral transitioned from ${encounter.referral_status} to ${targetStatus}.`,
      previousReferralStatus: encounter.referral_status,
      encounter: updateRes.rows[0]
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error updating referral status:", err.message);
    res.status(500).json({ error: "Internal server error updating referral status." });
  } finally {
    client.release();
  }
};

/**
 * GET /encounters/patient/:patientType/:patientId
 * Returns all encounters for a patient ordered chronologically
 */
const getPatientEncounters = async (req, res) => {
  const { patientType, patientId } = req.params;

  if (!patientType || !patientId) {
    return res.status(400).json({ error: "Missing required params: patientType and patientId." });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * 
       FROM "sanCodeClinical_encounters" 
       WHERE patient_type = $1 AND patient_id = $2 
       ORDER BY created_at DESC`,
      [patientType.toUpperCase(), Number(patientId)]
    );

    res.status(200).json({
      status: "success",
      patientType: patientType.toUpperCase(),
      patientId: Number(patientId),
      count: result.rows.length,
      encounters: result.rows
    });
  } catch (err) {
    console.error("Error fetching patient encounters:", err.message);
    res.status(500).json({ error: "Internal server error fetching patient encounters." });
  } finally {
    client.release();
  }
};

/**
 * GET /encounters/referrals/active
 * Returns all currently active / pending hospital referrals
 */
const getActiveReferrals = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT e.*, s."fName", s."sName", s."class", s."parent_phone"
       FROM "sanCodeClinical_encounters" e
       LEFT JOIN "sanCodeStudent" s ON (e.patient_type = 'STUDENT' AND e.patient_id = s."admNo")
       WHERE e.referral_status IN ('REFERRED', 'TRANSFERRED')
       ORDER BY e.created_at DESC`
    );

    res.status(200).json({
      status: "success",
      count: result.rows.length,
      referrals: result.rows
    });
  } catch (err) {
    console.error("Error fetching active referrals:", err.message);
    res.status(500).json({ error: "Internal server error fetching active referrals." });
  } finally {
    client.release();
  }
};

module.exports = {
  ENCOUNTER_STATUS,
  REFERRAL_STATUS,
  ENCOUNTER_TRANSITIONS,
  REFERRAL_TRANSITIONS,
  isValidEncounterTransition,
  isValidReferralTransition,
  recordClinicalEncounter,
  createEncounter,
  updateEncounterStatus,
  updateReferralStatus,
  getPatientEncounters,
  getActiveReferrals
};
