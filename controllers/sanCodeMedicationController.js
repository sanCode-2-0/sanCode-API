// controllers/sanCodeMedicationController.js
const { supabase } = require("../config/supabase/config.js");

/**
 * Deducts medication stock using FIFO (First In, First Out) batch processing.
 * Logs transaction audits in sanCodeMedication_logs.
 */
const deductMedicationStock = async (visitRecordId, officialName, quantity, nurseEmail) => {
  if (!officialName || quantity <= 0) return;

  try {
    // 1. Fetch medication from inventory matching the official name
    const { data: medItem, error: fetchErr } = await supabase
      .from("sanCodeMedication_inventory")
      .select("*")
      .eq("name", officialName)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!medItem) {
      console.log(`[Inventory Warn]: Medication "${officialName}" is not registered in the inventory database.`);
      return;
    }

    // 2. Fetch active batches for this medication ordered by expiry_date (oldest first - FIFO)
    const { data: batches, error: batchErr } = await supabase
      .from("sanCodeMedication_batches")
      .select("*")
      .eq("medication_id", medItem.id)
      .gt("quantity", 0)
      .order("expiry_date", { ascending: true });

    if (batchErr) throw batchErr;

    if (!batches || batches.length === 0) {
      console.log(`[Inventory Warn]: Stock is 0 for medication "${officialName}". Could not deduct.`);
      return;
    }

    let remainingToDeduct = quantity;
    let actualDeducted = 0;

    for (const batch of batches) {
      if (remainingToDeduct <= 0) break;

      const deduction = Math.min(batch.quantity, remainingToDeduct);
      
      const { error: updateBatchErr } = await supabase
        .from("sanCodeMedication_batches")
        .update({ quantity: batch.quantity - deduction })
        .eq("id", batch.id);

      if (updateBatchErr) {
        console.error(`[Inventory Error]: Failed to update batch ${batch.batch_no} for ${officialName}`);
        continue;
      }

      remainingToDeduct -= deduction;
      actualDeducted += deduction;
    }

    // 3. If any stock was successfully deducted, update main stock level and write logs
    if (actualDeducted > 0) {
      const { error: updateStockErr } = await supabase
        .from("sanCodeMedication_inventory")
        .update({ current_stock: medItem.current_stock - actualDeducted })
        .eq("id", medItem.id);

      if (updateStockErr) throw updateStockErr;

      // Log transaction in audit table
      const { error: logErr } = await supabase
        .from("sanCodeMedication_logs")
        .insert([{
          medication_id: medItem.id,
          change_type: "dispensation",
          quantity_changed: -actualDeducted,
          student_visit_id: visitRecordId,
          recorded_by: nurseEmail || "clinic-nurse"
        }]);

      if (logErr) throw logErr;

      console.log(`[Inventory Success]: Deducted ${actualDeducted} units of "${officialName}" for visit ID ${visitRecordId}`);
    }

    if (remainingToDeduct > 0) {
      console.log(`[Inventory Alert]: Insufficient stock for "${officialName}". Required: ${quantity}, Deducted: ${actualDeducted}.`);
    }

  } catch (err) {
    console.error(`[Inventory Exception]: Stock deduction for "${officialName}" failed:`, err.message);
  }
};

/**
 * Restocks medication inventory by inserting a new batch and incrementing the total stock.
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

  try {
    // 1. Fetch medication from inventory
    const { data: medItem, error: fetchErr } = await supabase
      .from("sanCodeMedication_inventory")
      .select("*")
      .eq("id", medicationId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!medItem) {
      return res.status(404).json({ error: "Medication not found in inventory." });
    }

    // 2. Insert batch record
    const { data: batch, error: batchErr } = await supabase
      .from("sanCodeMedication_batches")
      .insert([{
        medication_id: medicationId,
        batch_no: batchNo.trim(),
        quantity: qty,
        expiry_date: expiryDate
      }])
      .select()
      .single();

    if (batchErr) throw batchErr;

    // 3. Increment total stock in inventory
    const { error: updateStockErr } = await supabase
      .from("sanCodeMedication_inventory")
      .update({ current_stock: medItem.current_stock + qty })
      .eq("id", medicationId);

    if (updateStockErr) throw updateStockErr;

    // 4. Write to logs
    const { error: logErr } = await supabase
      .from("sanCodeMedication_logs")
      .insert([{
        medication_id: medicationId,
        change_type: "restock",
        quantity_changed: qty,
        recorded_by: req.user?.email || "clinic-nurse"
      }]);

    if (logErr) throw logErr;

    res.status(200).json({
      status: "success",
      message: `Successfully restocked ${qty} units of "${medItem.name}" in batch ${batchNo}.`
    });

  } catch (err) {
    console.error("Restock failed:", err.message);
    res.status(500).json({ error: "Internal server error during restocking process." });
  }
};

module.exports = {
  deductMedicationStock,
  restockMedication
};
