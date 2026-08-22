/**
 * Dashboard Metrics Service — Rural CareLink
 *
 * Computes quality-monitoring metrics from existing database tables.
 * Uses ONLY existing schema — no new tables created.
 *
 * Caller (controller) is responsible for:
 *   - Authentication (authenticate middleware)
 *   - Authorization (only district_admin / facility_admin)
 *   - NOT exposing patient-level PII in aggregate responses
 *
 * All metrics are aggregate unless a specific patient-authorized
 * request is explicitly made.
 */

import { sql } from "../db.js";

// ─── Referral Metrics ──────────────────────────────────────────────────────

/**
 * getReferralMetrics — aggregate referral statistics.
 * @param {{ facility_id?: number, district?: string }} filters
 * @returns {Promise<object>}
 */
export async function getReferralMetrics({ facility_id, district } = {}) {
    // Total referrals (optionally filtered by facility)
    const totalsResult = facility_id
        ? await sql`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status NOT IN ('completed')) AS pending,
                AVG(
                    EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600
                ) FILTER (WHERE status = 'completed') AS avg_completion_hours
            FROM referrals
            WHERE from_facility_id = ${facility_id} OR to_facility_id = ${facility_id}
          `
        : await sql`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status NOT IN ('completed')) AS pending,
                AVG(
                    EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600
                ) FILTER (WHERE status = 'completed') AS avg_completion_hours
            FROM referrals
          `;

    const row = totalsResult[0] || {};
    const total = parseInt(row.total || 0, 10);
    const completed = parseInt(row.completed || 0, 10);
    const pending = parseInt(row.pending || 0, 10);
    const avgHours = row.avg_completion_hours ? parseFloat(row.avg_completion_hours).toFixed(1) : null;

    return {
        total,
        completed,
        pending,
        completion_rate: total > 0 ? ((completed / total) * 100).toFixed(1) + "%" : "0%",
        average_completion_hours: avgHours ? `${avgHours}h` : "N/A",
        filters_applied: { facility_id: facility_id || null, district: district || null },
    };
}

// ─── Follow-up Metrics ────────────────────────────────────────────────────

/**
 * getFollowupMetrics — aggregate follow-up statistics.
 * @param {{ facility_id?: number }} filters
 * @returns {Promise<object>}
 */
export async function getFollowupMetrics({ facility_id } = {}) {
    const today = new Date().toISOString().split("T")[0];

    const result = facility_id
        ? await sql`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status = 'pending' AND followup_date < ${today}::date) AS overdue,
                COUNT(*) FILTER (WHERE status = 'pending' AND followup_date >= ${today}::date) AS upcoming
            FROM followups
            WHERE facility_id = ${facility_id}
          `
        : await sql`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status = 'pending' AND followup_date < ${today}::date) AS overdue,
                COUNT(*) FILTER (WHERE status = 'pending' AND followup_date >= ${today}::date) AS upcoming
            FROM followups
          `;

    const row = result[0] || {};
    const total = parseInt(row.total || 0, 10);
    const completed = parseInt(row.completed || 0, 10);
    const overdue = parseInt(row.overdue || 0, 10);
    const upcoming = parseInt(row.upcoming || 0, 10);

    return {
        total,
        completed,
        overdue,
        upcoming,
        completion_rate: total > 0 ? ((completed / total) * 100).toFixed(1) + "%" : "0%",
        overdue_rate: total > 0 ? ((overdue / total) * 100).toFixed(1) + "%" : "0%",
        filters_applied: { facility_id: facility_id || null },
    };
}

// ─── Facility Metrics ─────────────────────────────────────────────────────

/**
 * getFacilityMetrics — workload and availability metrics per facility.
 * @param {{ facility_id?: number }} filters
 * @returns {Promise<object>}
 */
export async function getFacilityMetrics({ facility_id } = {}) {
    if (facility_id) {
        const facilityResult = await sql`
            SELECT
                f.id,
                f.name,
                f.facility_type,
                f.district,
                f.emergency_available,
                (SELECT COUNT(*) FROM patients p WHERE p.district = f.district) AS district_patient_count,
                (SELECT COUNT(*) FROM doctors d WHERE d.facility_id = f.id) AS doctor_count,
                (SELECT COUNT(*) FROM medicines m WHERE m.facility_id = f.id AND m.available = TRUE) AS available_medicines,
                (SELECT COUNT(*) FROM diagnostics di WHERE di.facility_id = f.id AND di.available = TRUE) AS available_diagnostics,
                (SELECT COUNT(*) FROM referrals r WHERE r.to_facility_id = f.id AND r.status NOT IN ('completed')) AS active_referrals
            FROM facilities f
            WHERE f.id = ${facility_id}
        `;

        if (facilityResult.length === 0) {
            return { error: "Facility not found.", facility_id };
        }

        return { facility: facilityResult[0] };
    }

    // Aggregate across all facilities
    const result = await sql`
        SELECT
            COUNT(*) AS total_facilities,
            COUNT(*) FILTER (WHERE emergency_available = TRUE) AS emergency_capable,
            COUNT(*) FILTER (WHERE is_active = TRUE) AS active_facilities
        FROM facilities
    `;

    return {
        aggregate: result[0] || {},
        note: "Provide facility_id for facility-specific metrics.",
    };
}

// ─── Medicine / Diagnostic Availability ──────────────────────────────────

/**
 * getAvailabilityMetrics — medicine and diagnostic availability.
 * @param {{ facility_id?: number }} filters
 * @returns {Promise<object>}
 */
export async function getAvailabilityMetrics({ facility_id } = {}) {
    const medicineResult = facility_id
        ? await sql`
            SELECT
                COUNT(*) AS total_medicines,
                COUNT(*) FILTER (WHERE available = TRUE) AS available,
                COUNT(*) FILTER (WHERE available = FALSE) AS stock_out
            FROM medicines WHERE facility_id = ${facility_id}
          `
        : await sql`
            SELECT
                COUNT(*) AS total_medicines,
                COUNT(*) FILTER (WHERE available = TRUE) AS available,
                COUNT(*) FILTER (WHERE available = FALSE) AS stock_out
            FROM medicines
          `;

    const diagnosticResult = facility_id
        ? await sql`
            SELECT
                COUNT(*) AS total_diagnostics,
                COUNT(*) FILTER (WHERE available = TRUE) AS available,
                COUNT(*) FILTER (WHERE available = FALSE) AS unavailable
            FROM diagnostics WHERE facility_id = ${facility_id}
          `
        : await sql`
            SELECT
                COUNT(*) AS total_diagnostics,
                COUNT(*) FILTER (WHERE available = TRUE) AS available,
                COUNT(*) FILTER (WHERE available = FALSE) AS unavailable
            FROM diagnostics
          `;

    const med = medicineResult[0] || {};
    const diag = diagnosticResult[0] || {};

    return {
        medicines: {
            total: parseInt(med.total_medicines || 0, 10),
            available: parseInt(med.available || 0, 10),
            stock_out: parseInt(med.stock_out || 0, 10),
        },
        diagnostics: {
            total: parseInt(diag.total_diagnostics || 0, 10),
            available: parseInt(diag.available || 0, 10),
            unavailable: parseInt(diag.unavailable || 0, 10),
        },
        filters_applied: { facility_id: facility_id || null },
    };
}

// ─── Emergency / Triage Metrics ───────────────────────────────────────────

/**
 * getEmergencyMetrics — high-risk triage counts and escalation insights.
 * No patient PII is exposed in the aggregate response.
 * @returns {Promise<object>}
 */
export async function getEmergencyMetrics() {
    const result = await sql`
        SELECT
            COUNT(*) AS total_triage,
            COUNT(*) FILTER (WHERE risk_level = 'high') AS high_risk,
            COUNT(*) FILTER (WHERE risk_level = 'medium') AS medium_risk,
            COUNT(*) FILTER (WHERE risk_level = 'low') AS low_risk,
            COUNT(*) FILTER (WHERE urgency = 'urgent') AS urgent_cases,
            COUNT(*) FILTER (WHERE recommended_care_level = 'emergency') AS emergency_recommended,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS last_7_days,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS last_30_days
        FROM triage_records
    `;

    const row = result[0] || {};

    return {
        total_triage_records: parseInt(row.total_triage || 0, 10),
        risk_breakdown: {
            high: parseInt(row.high_risk || 0, 10),
            medium: parseInt(row.medium_risk || 0, 10),
            low: parseInt(row.low_risk || 0, 10),
        },
        urgent_cases: parseInt(row.urgent_cases || 0, 10),
        emergency_care_recommended: parseInt(row.emergency_recommended || 0, 10),
        recent: {
            last_7_days: parseInt(row.last_7_days || 0, 10),
            last_30_days: parseInt(row.last_30_days || 0, 10),
        },
        ai_safety_notice:
            "These metrics are derived from AI-assisted preliminary triage records. " +
            "They represent decision-support data, not clinical diagnoses.",
    };
}

/**
 * getAllMetrics — convenience function to fetch all metrics at once.
 * @param {{ facility_id?: number, district?: string }} filters
 * @returns {Promise<object>}
 */
export async function getAllMetrics(filters = {}) {
    const [referrals, followups, facility, availability, emergency] = await Promise.all([
        getReferralMetrics(filters),
        getFollowupMetrics(filters),
        getFacilityMetrics(filters),
        getAvailabilityMetrics(filters),
        getEmergencyMetrics(),
    ]);

    return {
        generated_at: new Date().toISOString(),
        referrals,
        followups,
        facility,
        availability,
        emergency,
        note: "All metrics are aggregate. No patient-level PII is included.",
    };
}
