/**
 * Dashboard Controller — Rural CareLink
 *
 * Provides quality-monitoring metrics to authorized users.
 *
 * Access:
 *   district_admin — all metrics (aggregate, no patient PII)
 *   facility_admin — facility-scoped metrics
 *
 * Endpoints:
 *   GET /api/dashboard/metrics           — All metrics summary
 *   GET /api/dashboard/referrals         — Referral metrics
 *   GET /api/dashboard/followups         — Follow-up metrics
 *   GET /api/dashboard/facilities        — Facility metrics
 *   GET /api/dashboard/availability      — Medicine/diagnostic availability
 *   GET /api/dashboard/emergency         — Emergency/triage metrics
 */

import { sendSuccess, sendError } from "../utils/response.js";
import {
    getAllMetrics,
    getReferralMetrics,
    getFollowupMetrics,
    getFacilityMetrics,
    getAvailabilityMetrics,
    getEmergencyMetrics,
} from "../services/dashboardMetricsService.js";

// ─── Helper: extract authorized filters from request ─────────────────────

function getFilters(req) {
    const filters = {};

    // facility_admin can only see their facility's metrics
    // district_admin can filter by facility or district if they provide it
    if (req.user.role === "facility_admin" && req.query.facility_id) {
        filters.facility_id = parseInt(req.query.facility_id, 10);
    } else if (req.query.facility_id) {
        filters.facility_id = parseInt(req.query.facility_id, 10);
    }

    if (req.query.district) {
        filters.district = req.query.district;
    }

    return filters;
}

// ─── GET /api/dashboard/metrics ──────────────────────────────────────────

export const getDashboardMetrics = async (req, res, next) => {
    try {
        const filters = getFilters(req);
        const metrics = await getAllMetrics(filters);
        return sendSuccess(res, 200, "Dashboard metrics retrieved.", { metrics });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/dashboard/referrals ────────────────────────────────────────

export const getReferralDashboard = async (req, res, next) => {
    try {
        const filters = getFilters(req);
        const metrics = await getReferralMetrics(filters);
        return sendSuccess(res, 200, "Referral metrics retrieved.", { referrals: metrics });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/dashboard/followups ────────────────────────────────────────

export const getFollowupDashboard = async (req, res, next) => {
    try {
        const filters = getFilters(req);
        const metrics = await getFollowupMetrics(filters);
        return sendSuccess(res, 200, "Follow-up metrics retrieved.", { followups: metrics });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/dashboard/facilities ───────────────────────────────────────

export const getFacilityDashboard = async (req, res, next) => {
    try {
        const filters = getFilters(req);
        const metrics = await getFacilityMetrics(filters);
        return sendSuccess(res, 200, "Facility metrics retrieved.", { facility: metrics });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/dashboard/availability ─────────────────────────────────────

export const getAvailabilityDashboard = async (req, res, next) => {
    try {
        const filters = getFilters(req);
        const metrics = await getAvailabilityMetrics(filters);
        return sendSuccess(res, 200, "Availability metrics retrieved.", { availability: metrics });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/dashboard/emergency ────────────────────────────────────────

export const getEmergencyDashboard = async (req, res, next) => {
    try {
        const metrics = await getEmergencyMetrics();
        return sendSuccess(res, 200, "Emergency/triage metrics retrieved.", { emergency: metrics });
    } catch (error) {
        next(error);
    }
};
