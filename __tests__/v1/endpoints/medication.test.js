import request from "supertest";
import { app } from "../../../express-app.js";
import {
  deductMedicationStock,
  DEDUCTION_STATES
} from "../../../controllers/sanCodeMedicationController.js";

describe("Medication Inventory & Deduction State Machine", () => {
  test("Exported DEDUCTION_STATES contains all explicit lifecycle outcomes", () => {
    expect(DEDUCTION_STATES).toHaveProperty("UNREGISTERED");
    expect(DEDUCTION_STATES).toHaveProperty("OUT_OF_STOCK");
    expect(DEDUCTION_STATES).toHaveProperty("INSUFFICIENT_STOCK");
    expect(DEDUCTION_STATES).toHaveProperty("DEDUCTED");
    expect(DEDUCTION_STATES).toHaveProperty("SKIPPED");
    expect(DEDUCTION_STATES).toHaveProperty("FAILED");
  });

  test("deductMedicationStock handles empty/invalid input gracefully (SKIPPED)", async () => {
    const resEmpty = await deductMedicationStock(null, "", 1, "test-nurse");
    expect(resEmpty.status).toBe(DEDUCTION_STATES.SKIPPED);
    expect(resEmpty.deducted).toBe(0);

    const resZero = await deductMedicationStock(null, "Paracetamol 500mg", 0, "test-nurse");
    expect(resZero.status).toBe(DEDUCTION_STATES.SKIPPED);
    expect(resZero.deducted).toBe(0);
  });

  test("deductMedicationStock returns UNREGISTERED for non-existent medication", async () => {
    const result = await deductMedicationStock(
      null,
      "NonExistentDrugXYZ9999",
      2,
      "test-nurse"
    );
    expect(result.status).toBe(DEDUCTION_STATES.UNREGISTERED);
    expect(result.deducted).toBe(0);
    expect(result.required).toBe(2);
  });

  test("POST /inventory/restock returns 400 on missing required fields", async () => {
    const response = await request(app)
      .post("/inventory/restock")
      .send({ batchNo: "B-TEST-001" })
      .expect(400);

    expect(response.body).toHaveProperty("error");
  });

  test("POST /inventory/restock returns 400 on non-positive quantity", async () => {
    const response = await request(app)
      .post("/inventory/restock")
      .send({
        medicationId: "00000000-0000-0000-0000-000000000000",
        batchNo: "B-TEST-001",
        quantity: -5,
        expiryDate: "2026-12-31"
      })
      .expect(400);

    expect(response.body).toHaveProperty("error");
  });

  test("POST /inventory/restock returns 404 for unknown medication ID", async () => {
    const response = await request(app)
      .post("/inventory/restock")
      .send({
        medicationId: "00000000-0000-0000-0000-000000000000",
        batchNo: "B-TEST-001",
        quantity: 10,
        expiryDate: "2026-12-31"
      })
      .expect(404);

    expect(response.body).toHaveProperty("error");
  });
});
