// controllers/sanCodeMedicationController.js
const { pool } = require("../config/pg.js");

/**
 * Explicit state outcomes for medication deduction transactions
 */
const DEDUCTION_STATES = {
  UNREGISTERED: "UNREGISTERED",             // Medication not found in catalog
  OUT_OF_STOCK: "OUT_OF_STOCK",             // Available current_stock <= 0 or no active batches
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",   // Available quantity is less than requested quantity
  DEDUCTED: "DEDUCTED",                     // Fully deducted across FIFO batches
  SKIPPED: "SKIPPED",                       // Invalid input or quantity <= 0
  FAILED: "FAILED"                          // Transaction failed / rolled back
};

/**
 * Deducts medication stock using transactional FIFO (First In, First Out) batch processing.
 * Enforces atomic state transitions across inventory and batch tables with row-level locks.
 * Logs transaction audits in sanCodeMedication_logs.
 *
 * @param {number|null} visitRecordId - History ID of the patient visit
 * @param {string} officialName - Official name of the medication
 * @param {number} quantity - Number of units to deduct
 * @param {string} nurseEmail - Email/ID of the nurse administering medication
 * @returns {Promise<{ status: string, deducted: number, required: number, medId?: string }>}
 */
const deductMedicationStock = async (visitRecordId, officialName, quantity, nurseEmail) => {
  if (!officialName || quantity <= 0) {
    return { status: DEDUCTION_STATES.SKIPPED, deducted: 0, required: quantity || 0 };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Fetch and lock medication from inventory matching official name or alias (row-level lock)
    const medResult = await client.query(
      `SELECT id, name, current_stock 
       FROM "sanCodeMedication_inventory" 
       WHERE LOWER(name) = LOWER($1) 
          OR $1 ILIKE ANY(alias)
       LIMIT 1 
       FOR UPDATE`,
      [officialName.trim()]
    );

    if (medResult.rows.length === 0) {
      await client.query("ROLLBACK");
      console.log(`[Inventory Warn]: Medication "${officialName}" is not registered in the inventory database.`);
      return { status: DEDUCTION_STATES.UNREGISTERED, deducted: 0, required: quantity };
    }

    const medItem = medResult.rows[0];

    // 2. Fetch and lock active batches ordered by expiry_date ASC (FIFO)
    const batchResult = await client.query(
      `SELECT id, batch_no, quantity, expiry_date 
       FROM "sanCodeMedication_batches" 
       WHERE medication_id = $1 AND quantity > 0 
       ORDER BY expiry_date ASC 
       FOR UPDATE`,
      [medItem.id]
    );

    const batches = batchResult.rows;

    if (!batches || batches.length === 0 || medItem.current_stock <= 0) {
      await client.query("ROLLBACK");
      console.log(`[Inventory Warn]: Stock is 0 for medication "${officialName}". Could not deduct.`);
      return { status: DEDUCTION_STATES.OUT_OF_STOCK, deducted: 0, required: quantity, medId: medItem.id };
    }

    let remainingToDeduct = quantity;
    let actualDeducted = 0;

    // 3. Deduct from batches using FIFO
    for (const batch of batches) {
      if (remainingToDeduct <= 0) break;

      const deduction = Math.min(batch.quantity, remainingToDeduct);

      await client.query(
        `UPDATE "sanCodeMedication_batches" 
         SET quantity = quantity - $1 
         WHERE id = $2`,
        [deduction, batch.id]
      );

      remainingToDeduct -= deduction;
      actualDeducted += deduction;
    }

    // 4. Update overall inventory stock and write audit log
    if (actualDeducted > 0) {
      await client.query(
        `UPDATE "sanCodeMedication_inventory" 
         SET current_stock = current_stock - $1 
         WHERE id = $2`,
        [actualDeducted, medItem.id]
      );

      await client.query(
        `INSERT INTO "sanCodeMedication_logs" 
           (medication_id, change_type, quantity_changed, student_visit_id, recorded_by, timestamp) 
         VALUES ($1, 'dispensation', $2, $3, $4, NOW())`,
        [
          medItem.id,
          -actualDeducted,
          visitRecordId ? Number(visitRecordId) : null,
          nurseEmail || "clinic-nurse"
        ]
      );
    }

    await client.query("COMMIT");

    const finalState = remainingToDeduct === 0
      ? DEDUCTION_STATES.DEDUCTED
      : DEDUCTION_STATES.INSUFFICIENT_STOCK;

    if (actualDeducted > 0) {
      console.log(`[Inventory Success]: Deducted ${actualDeducted} units of "${officialName}" for visit ID ${visitRecordId}`);
    }

    if (remainingToDeduct > 0) {
      console.log(`[Inventory Alert]: Insufficient stock for "${officialName}". Required: ${quantity}, Deducted: ${actualDeducted}.`);
    }

    return {
      status: finalState,
      deducted: actualDeducted,
      required: quantity,
      medId: medItem.id
    };

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[Inventory Exception]: Stock deduction for "${officialName}" failed:`, err.message);
    return { status: DEDUCTION_STATES.FAILED, error: err.message, deducted: 0, required: quantity };
  } finally {
    client.release();
  }
};

/**
 * Restocks medication inventory by inserting a new batch and incrementing total stock atomically.
 */
const restockMedication = async (req, res) => {
  const { medicationId, batchNo, quantity, expiryDate } = req.body;

  if (!medicationId || !batchNo || !quantity || !expiryDate) {
    return res.status(400).json({ error: "Missing required fields: medicationId, batchNo, quantity, and expiryDate." });
  }

  const qty = parseInt(quantity);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: "Quantity must be a positive integer." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Fetch medication from inventory with lock
    const medResult = await client.query(
      `SELECT id, name, current_stock 
       FROM "sanCodeMedication_inventory" 
       WHERE id = $1 
       FOR UPDATE`,
      [medicationId]
    );

    if (medResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Medication not found in inventory." });
    }

    const medItem = medResult.rows[0];

    // 2. Insert batch record
    const batchResult = await client.query(
      `INSERT INTO "sanCodeMedication_batches" (medication_id, batch_no, quantity, expiry_date, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [medicationId, batchNo.trim(), qty, expiryDate]
    );

    // 3. Increment total stock in inventory
    await client.query(
      `UPDATE "sanCodeMedication_inventory" 
       SET current_stock = current_stock + $1 
       WHERE id = $2`,
      [qty, medicationId]
    );

    // 4. Write audit log
    await client.query(
      `INSERT INTO "sanCodeMedication_logs" (medication_id, change_type, quantity_changed, recorded_by, timestamp)
       VALUES ($1, 'restock', $2, $3, NOW())`,
      [medicationId, qty, req.user?.email || "clinic-nurse"]
    );

    await client.query("COMMIT");

    res.status(200).json({
      status: "success",
      message: `Successfully restocked ${qty} units of "${medItem.name}" in batch ${batchNo.trim()}.`,
      batch: batchResult.rows[0]
    });

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Restock failed:", err.message);
    res.status(500).json({ error: "Internal server error during restocking process." });
  } finally {
    client.release();
  }
};

module.exports = {
  DEDUCTION_STATES,
  deductMedicationStock,
  restockMedication
};
