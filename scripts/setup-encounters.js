const { pool } = require("../config/pg.js");

async function setup() {
  const client = await pool.connect();
  try {
    console.log("Checking if sanCodeClinical_encounters table exists...");
    const checkRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'sanCodeClinical_encounters';
    `);

    if (checkRes.rows.length === 0) {
      console.log("Creating sanCodeClinical_encounters table...");
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'encounter_status') THEN
            CREATE TYPE encounter_status AS ENUM (
              'TRIAGE',
              'IN_CONSULTATION',
              'DISPENSED',
              'REFERRED',
              'DISCHARGED'
            );
          END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS "sanCodeClinical_encounters" (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          patient_type VARCHAR(20) NOT NULL DEFAULT 'STUDENT', -- 'STUDENT', 'STAFF', 'VISITOR'
          patient_id INTEGER NOT NULL,                         -- admNo or idNo
          status encounter_status NOT NULL DEFAULT 'TRIAGE',
          temp_reading NUMERIC(4, 1),
          complaint TEXT,
          ailment TEXT,
          medication TEXT,
          referral_status VARCHAR(30) NOT NULL DEFAULT 'NONE', -- 'NONE', 'REFERRED', 'TRANSFERRED', 'CLEARED'
          referral_notes TEXT,
          nurse_email VARCHAR(100) DEFAULT 'clinic-nurse',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_encounters_patient 
          ON "sanCodeClinical_encounters" (patient_type, patient_id);

        CREATE INDEX IF NOT EXISTS idx_encounters_status 
          ON "sanCodeClinical_encounters" (status);

        CREATE INDEX IF NOT EXISTS idx_encounters_created_at 
          ON "sanCodeClinical_encounters" (created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_encounters_referral 
          ON "sanCodeClinical_encounters" (referral_status);
      `);
      console.log("Table sanCodeClinical_encounters created successfully!");
    } else {
      console.log("Table sanCodeClinical_encounters already exists.");
    }

    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sanCodeClinical_encounters'
      ORDER BY ordinal_position;
    `);
    console.log("Columns:", cols.rows);

  } catch (err) {
    console.error("Setup error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

setup();
