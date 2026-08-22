import { fileURLToPath } from "url";
import path from "path";
import { sql } from "./db.js";

/**
 * Creates all database tables in dependency order.
 * Uses CREATE TABLE IF NOT EXISTS so it is safe to run repeatedly.
 *
 * Table order:
 *   1. users
 *   2. facilities
 *   3. doctors       (FK → users, facilities)
 *   4. patients      (FK → users)
 *   5. medical_records (FK → patients, doctors, facilities)
 *   6. triage_records  (FK → patients, users)
 *   7. referrals       (FK → patients, facilities, users)
 *   8. followups       (FK → patients, doctors, facilities)
 *   9. diagnostics     (FK → facilities)
 *  10. medicines       (FK → facilities)
 *  11. appointments    (FK → patients, doctors, facilities)
 *  12. queue           (FK → facilities, patients, appointments)
 *  13. diagnostic_requests  (FK → patients, doctors, facilities, diagnostics)
 *  14. diagnostic_reports   (FK → patients, diagnostic_requests)
 *  15. emergency_escalations (FK → patients, triage_records, referrals, users, facilities)
 *  16. audit_logs      (FK → users)
 *  17. teleconsultations (FK → patients, doctors, facilities, appointments)
 *  18. sync_records    (standalone)
 */
async function initDB() {
    try {
        // ── 1. users ──────────────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                role VARCHAR(30) NOT NULL DEFAULT 'patient',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 2. facilities ─────────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS facilities (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                facility_type VARCHAR(50) NOT NULL,
                address TEXT,
                district VARCHAR(100),
                state VARCHAR(100) DEFAULT 'Maharashtra',
                phone VARCHAR(20),
                latitude DECIMAL(10,7),
                longitude DECIMAL(10,7),
                emergency_available BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 3. doctors ────────────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS doctors (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
                facility_id INTEGER
                    REFERENCES facilities(id) ON DELETE SET NULL,
                specialization VARCHAR(100),
                availability TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 4. patients ───────────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS patients (
                id SERIAL PRIMARY KEY,
                user_id INTEGER
                    REFERENCES users(id) ON DELETE SET NULL,
                date_of_birth DATE,
                gender VARCHAR(20),
                blood_group VARCHAR(10),
                address TEXT,
                district VARCHAR(100),
                known_conditions TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 5. medical_records ─────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS medical_records (
                id SERIAL PRIMARY KEY,
                patient_id INTEGER NOT NULL
                    REFERENCES patients(id) ON DELETE CASCADE,
                doctor_id INTEGER
                    REFERENCES doctors(id) ON DELETE SET NULL,
                facility_id INTEGER
                    REFERENCES facilities(id) ON DELETE SET NULL,
                symptoms TEXT,
                vitals JSONB,
                clinical_notes TEXT,
                assessment TEXT,
                prescription TEXT,
                visit_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 6. triage_records ──────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS triage_records (
                id SERIAL PRIMARY KEY,
                patient_id INTEGER NOT NULL
                    REFERENCES patients(id) ON DELETE CASCADE,
                created_by INTEGER
                    REFERENCES users(id) ON DELETE SET NULL,
                symptoms JSONB,
                vitals JSONB,
                risk_level VARCHAR(30),
                urgency VARCHAR(30),
                recommended_care_level VARCHAR(100),
                red_flags JSONB,
                ai_response JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 7. referrals ──────────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS referrals (
                id SERIAL PRIMARY KEY,
                referral_code VARCHAR(50) NOT NULL UNIQUE,
                patient_id INTEGER NOT NULL
                    REFERENCES patients(id) ON DELETE CASCADE,
                from_facility_id INTEGER
                    REFERENCES facilities(id) ON DELETE SET NULL,
                to_facility_id INTEGER
                    REFERENCES facilities(id) ON DELETE SET NULL,
                created_by INTEGER
                    REFERENCES users(id) ON DELETE SET NULL,
                reason TEXT,
                priority VARCHAR(20) DEFAULT 'normal',
                status VARCHAR(30) DEFAULT 'created',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 8. followups ──────────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS followups (
                id SERIAL PRIMARY KEY,
                patient_id INTEGER NOT NULL
                    REFERENCES patients(id) ON DELETE CASCADE,
                doctor_id INTEGER
                    REFERENCES doctors(id) ON DELETE SET NULL,
                facility_id INTEGER
                    REFERENCES facilities(id) ON DELETE SET NULL,
                followup_date DATE NOT NULL,
                reason TEXT,
                status VARCHAR(30) DEFAULT 'pending',
                notes TEXT,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 9. diagnostics ────────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS diagnostics (
                id SERIAL PRIMARY KEY,
                facility_id INTEGER NOT NULL
                    REFERENCES facilities(id) ON DELETE CASCADE,
                test_name VARCHAR(255) NOT NULL,
                available BOOLEAN DEFAULT FALSE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (facility_id, test_name)
            );
        `;

        // ── 10. medicines ─────────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS medicines (
                id SERIAL PRIMARY KEY,
                facility_id INTEGER NOT NULL
                    REFERENCES facilities(id) ON DELETE CASCADE,
                medicine_name VARCHAR(255) NOT NULL,
                quantity INTEGER DEFAULT 0,
                available BOOLEAN DEFAULT FALSE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (facility_id, medicine_name)
            );
        `;

        // ── 11. appointments ──────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS appointments (
                id SERIAL PRIMARY KEY,
                patient_id INTEGER NOT NULL
                    REFERENCES patients(id) ON DELETE CASCADE,
                doctor_id INTEGER
                    REFERENCES doctors(id) ON DELETE SET NULL,
                facility_id INTEGER
                    REFERENCES facilities(id) ON DELETE SET NULL,
                appointment_date TIMESTAMP NOT NULL,
                reason TEXT,
                status VARCHAR(30) DEFAULT 'scheduled',
                notes TEXT,
                created_by INTEGER
                    REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 12. queue ─────────────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS queue (
                id SERIAL PRIMARY KEY,
                facility_id INTEGER NOT NULL
                    REFERENCES facilities(id) ON DELETE CASCADE,
                patient_id INTEGER NOT NULL
                    REFERENCES patients(id) ON DELETE CASCADE,
                appointment_id INTEGER
                    REFERENCES appointments(id) ON DELETE SET NULL,
                token_number INTEGER NOT NULL,
                queue_date DATE NOT NULL DEFAULT CURRENT_DATE,
                status VARCHAR(30) DEFAULT 'waiting',
                priority VARCHAR(20) DEFAULT 'normal',
                called_at TIMESTAMP,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (facility_id, token_number, queue_date)
            );
        `;

        // ── 13. diagnostic_requests ───────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS diagnostic_requests (
                id SERIAL PRIMARY KEY,
                patient_id INTEGER NOT NULL
                    REFERENCES patients(id) ON DELETE CASCADE,
                doctor_id INTEGER
                    REFERENCES doctors(id) ON DELETE SET NULL,
                facility_id INTEGER
                    REFERENCES facilities(id) ON DELETE SET NULL,
                diagnostic_id INTEGER
                    REFERENCES diagnostics(id) ON DELETE SET NULL,
                test_name VARCHAR(255) NOT NULL,
                clinical_notes TEXT,
                status VARCHAR(30) DEFAULT 'pending',
                urgency VARCHAR(20) DEFAULT 'routine',
                requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 14. diagnostic_reports ────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS diagnostic_reports (
                id SERIAL PRIMARY KEY,
                patient_id INTEGER NOT NULL
                    REFERENCES patients(id) ON DELETE CASCADE,
                request_id INTEGER
                    REFERENCES diagnostic_requests(id) ON DELETE SET NULL,
                test_name VARCHAR(255) NOT NULL,
                result TEXT,
                result_data JSONB,
                interpretation TEXT,
                reported_by INTEGER
                    REFERENCES users(id) ON DELETE SET NULL,
                reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 15. emergency_escalations ─────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS emergency_escalations (
                id SERIAL PRIMARY KEY,
                patient_id INTEGER NOT NULL
                    REFERENCES patients(id) ON DELETE CASCADE,
                triage_id INTEGER
                    REFERENCES triage_records(id) ON DELETE SET NULL,
                referral_id INTEGER
                    REFERENCES referrals(id) ON DELETE SET NULL,
                confirmed_by INTEGER
                    REFERENCES users(id) ON DELETE SET NULL,
                facility_id INTEGER
                    REFERENCES facilities(id) ON DELETE SET NULL,
                escalation_recommended BOOLEAN NOT NULL DEFAULT FALSE,
                recommended_care_level VARCHAR(100),
                red_flags JSONB,
                status VARCHAR(30) DEFAULT 'active',
                notification_status VARCHAR(30) DEFAULT 'not_sent',
                ai_safety_notice TEXT,
                escalated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 16. audit_logs ────────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER
                    REFERENCES users(id) ON DELETE SET NULL,
                action VARCHAR(100) NOT NULL,
                resource_type VARCHAR(50),
                resource_id VARCHAR(100),
                metadata JSONB,
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 17. teleconsultations ─────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS teleconsultations (
                id SERIAL PRIMARY KEY,
                patient_id INTEGER NOT NULL
                    REFERENCES patients(id) ON DELETE CASCADE,
                doctor_id INTEGER
                    REFERENCES doctors(id) ON DELETE SET NULL,
                facility_id INTEGER
                    REFERENCES facilities(id) ON DELETE SET NULL,
                appointment_id INTEGER
                    REFERENCES appointments(id) ON DELETE SET NULL,
                created_by INTEGER
                    REFERENCES users(id) ON DELETE SET NULL,
                consultation_type VARCHAR(50) DEFAULT 'video',
                status VARCHAR(30) DEFAULT 'scheduled',
                scheduled_at TIMESTAMP,
                started_at TIMESTAMP,
                ended_at TIMESTAMP,
                doctor_notes TEXT,
                patient_consent BOOLEAN DEFAULT FALSE,
                session_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ── 18. sync_records ──────────────────────────────────────
        await sql`
            CREATE TABLE IF NOT EXISTS sync_records (
                id SERIAL PRIMARY KEY,
                device_id VARCHAR(255) NOT NULL,
                sync_type VARCHAR(50) NOT NULL,
                resource_type VARCHAR(50),
                resource_id INTEGER,
                sync_data JSONB,
                status VARCHAR(30) DEFAULT 'pending',
                direction VARCHAR(10) DEFAULT 'upload',
                synced_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        console.log("✅ Database initialized successfully — all 18 tables created");
    } catch (error) {
        console.error("❌ Error initializing database:", error);
        throw error;
    }
}

export default initDB;

// Allow running directly: node src/initDB.js
const currentFilePath = fileURLToPath(import.meta.url);
const executedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMainModule = executedFilePath && (
    executedFilePath.toLowerCase() === currentFilePath.toLowerCase() ||
    executedFilePath.toLowerCase().endsWith(path.sep + "initdb.js")
);

if (isMainModule) {
    initDB()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
