import request from "supertest";
import { app } from "../../../express-app.js";
import {
  ENCOUNTER_STATUS,
  REFERRAL_STATUS,
  ENCOUNTER_TRANSITIONS,
  REFERRAL_TRANSITIONS,
  isValidEncounterTransition,
  isValidReferralTransition
} from "../../../controllers/encounterController.js";

describe("Clinical Encounter & Referral State Machine", () => {
  describe("Transition Rules & Matrix Guards", () => {
    test("Encounter lifecycle enforces forward-only transitions", () => {
      expect(isValidEncounterTransition(ENCOUNTER_STATUS.TRIAGE, ENCOUNTER_STATUS.IN_CONSULTATION)).toBe(true);
      expect(isValidEncounterTransition(ENCOUNTER_STATUS.IN_CONSULTATION, ENCOUNTER_STATUS.DISPENSED)).toBe(true);
      expect(isValidEncounterTransition(ENCOUNTER_STATUS.DISPENSED, ENCOUNTER_STATUS.DISCHARGED)).toBe(true);

      // Illegal backward or bypass transitions
      expect(isValidEncounterTransition(ENCOUNTER_STATUS.DISCHARGED, ENCOUNTER_STATUS.TRIAGE)).toBe(false);
      expect(isValidEncounterTransition(ENCOUNTER_STATUS.DISCHARGED, ENCOUNTER_STATUS.IN_CONSULTATION)).toBe(false);
    });

    test("Referral lifecycle enforces valid progression", () => {
      expect(isValidReferralTransition(REFERRAL_STATUS.NONE, REFERRAL_STATUS.REFERRED)).toBe(true);
      expect(isValidReferralTransition(REFERRAL_STATUS.REFERRED, REFERRAL_STATUS.TRANSFERRED)).toBe(true);
      expect(isValidReferralTransition(REFERRAL_STATUS.TRANSFERRED, REFERRAL_STATUS.CLEARED)).toBe(true);

      // Illegal transitions
      expect(isValidReferralTransition(REFERRAL_STATUS.CLEARED, REFERRAL_STATUS.REFERRED)).toBe(false);
      expect(isValidReferralTransition(REFERRAL_STATUS.CLEARED, REFERRAL_STATUS.TRANSFERRED)).toBe(false);
    });
  });

  describe("API Endpoints Lifecycle Integration", () => {
    let createdEncounterId = null;

    test("POST /encounters creates encounter in TRIAGE state", async () => {
      const response = await request(app)
        .post("/encounters")
        .send({
          patientType: "STUDENT",
          patientId: 13256,
          tempReading: 37.4,
          complaint: "Mild headache",
          status: "TRIAGE"
        })
        .expect(201);

      expect(response.body).toHaveProperty("encounter");
      expect(response.body.encounter.status).toBe(ENCOUNTER_STATUS.TRIAGE);
      expect(response.body.encounter.referral_status).toBe(REFERRAL_STATUS.NONE);
      expect(Number(response.body.encounter.patient_id)).toBe(13256);

      createdEncounterId = response.body.encounter.id;
    });

    test("POST /encounters rejects missing patientId", async () => {
      const response = await request(app)
        .post("/encounters")
        .send({ tempReading: 36.8 })
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });

    test("PATCH /encounters/:id/status transitions TRIAGE -> IN_CONSULTATION", async () => {
      const response = await request(app)
        .patch(`/encounters/${createdEncounterId}/status`)
        .send({ nextStatus: "IN_CONSULTATION" })
        .expect(200);

      expect(response.body.previousStatus).toBe(ENCOUNTER_STATUS.TRIAGE);
      expect(response.body.encounter.status).toBe(ENCOUNTER_STATUS.IN_CONSULTATION);
    });

    test("PATCH /encounters/:id/status transitions IN_CONSULTATION -> DISCHARGED", async () => {
      const response = await request(app)
        .patch(`/encounters/${createdEncounterId}/status`)
        .send({ nextStatus: "DISCHARGED" })
        .expect(200);

      expect(response.body.previousStatus).toBe(ENCOUNTER_STATUS.IN_CONSULTATION);
      expect(response.body.encounter.status).toBe(ENCOUNTER_STATUS.DISCHARGED);
    });

    test("PATCH /encounters/:id/status rejects illegal transition from DISCHARGED (terminal)", async () => {
      const response = await request(app)
        .patch(`/encounters/${createdEncounterId}/status`)
        .send({ nextStatus: "TRIAGE" })
        .expect(409);

      expect(response.body).toHaveProperty("error");
      expect(response.body.currentStatus).toBe(ENCOUNTER_STATUS.DISCHARGED);
    });

    test("PATCH /encounters/:id/referral transitions referral lifecycle", async () => {
      // 1. NONE -> REFERRED
      const refResponse = await request(app)
        .patch(`/encounters/${createdEncounterId}/referral`)
        .send({ nextReferralStatus: "REFERRED", referralNotes: "Referred to local district clinic" })
        .expect(200);

      expect(refResponse.body.encounter.referral_status).toBe(REFERRAL_STATUS.REFERRED);

      // 2. REFERRED -> TRANSFERRED
      const transferResponse = await request(app)
        .patch(`/encounters/${createdEncounterId}/referral`)
        .send({ nextReferralStatus: "TRANSFERRED" })
        .expect(200);

      expect(transferResponse.body.encounter.referral_status).toBe(REFERRAL_STATUS.TRANSFERRED);

      // 3. TRANSFERRED -> CLEARED
      const clearResponse = await request(app)
        .patch(`/encounters/${createdEncounterId}/referral`)
        .send({ nextReferralStatus: "CLEARED" })
        .expect(200);

      expect(clearResponse.body.encounter.referral_status).toBe(REFERRAL_STATUS.CLEARED);

      // 4. CLEARED -> REFERRED (illegal rejected with 409)
      await request(app)
        .patch(`/encounters/${createdEncounterId}/referral`)
        .send({ nextReferralStatus: "REFERRED" })
        .expect(409);
    });

    test("GET /encounters/patient/STUDENT/:patientId returns patient encounter history", async () => {
      const response = await request(app)
        .get("/encounters/patient/STUDENT/13256")
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(Array.isArray(response.body.encounters)).toBe(true);
      expect(response.body.count).toBeGreaterThanOrEqual(1);
    });

    test("GET /encounters/referrals/active returns list of active referrals", async () => {
      const response = await request(app)
        .get("/encounters/referrals/active")
        .expect(200);

      expect(response.body.status).toBe("success");
      expect(Array.isArray(response.body.referrals)).toBe(true);
    });
  });
});
