/**
 * Sync Controller — Offline Synchronization — Rural CareLink
 *
 * Handles batch offline record synchronization.
 *
 * Endpoints:
 *   POST /api/sync       — Submit offline records for sync
 *   POST /api/sync/batch — Submit multiple records in one request
 */

import { sendSuccess, sendError } from "../utils/response.js";
import { validateSyncPayload, processSyncRecord } from "../services/syncService.js";
import { writeAuditLog } from "../middleware/auditMiddleware.js";

// ─── POST /api/sync ───────────────────────────────────────────────────────

export const syncRecord = async (req, res, next) => {
    try {
        const payload = req.body;

        // Validate sync payload
        const validation = validateSyncPayload(payload);
        if (!validation.valid) {
            return sendError(
                res,
                400,
                `Invalid sync payload: ${validation.errors.join("; ")}`,
                "SYNC_VALIDATION_ERROR"
            );
        }

        const result = await processSyncRecord(payload, req.user.id);

        await writeAuditLog({
            user_id: req.user.id,
            action: "SYNC_RECORD",
            resource_type: payload.entity_type,
            resource_id: result.server_id,
            metadata: {
                client_record_id: payload.client_record_id,
                operation: payload.operation,
                result: result.result,
            },
            ip_address: req.ip,
        });

        const statusCode = result.result === "created" ? 201 : 200;
        return sendSuccess(statusCode === 201 ? res.status(201) : res, statusCode, "Sync processed.", {
            sync_result: result,
        });
    } catch (error) {
        next(error);
    }
};

// ─── POST /api/sync/batch ─────────────────────────────────────────────────

export const syncBatch = async (req, res, next) => {
    try {
        const { records } = req.body;

        if (!Array.isArray(records) || records.length === 0) {
            return sendError(res, 400, "records must be a non-empty array.", "VALIDATION_ERROR");
        }

        if (records.length > 100) {
            return sendError(res, 400, "Maximum 100 records per batch.", "BATCH_TOO_LARGE");
        }

        // Validate all records first
        const validationErrors = [];
        for (let i = 0; i < records.length; i++) {
            const validation = validateSyncPayload(records[i]);
            if (!validation.valid) {
                validationErrors.push({ index: i, errors: validation.errors });
            }
        }

        if (validationErrors.length > 0) {
            return sendError(
                res,
                400,
                `${validationErrors.length} record(s) failed validation.`,
                "BATCH_VALIDATION_ERROR",
            );
        }

        // Process all records
        const results = [];
        for (const record of records) {
            const result = await processSyncRecord(record, req.user.id);
            results.push(result);
        }

        const summary = {
            total: results.length,
            created: results.filter(r => r.result === "created").length,
            updated: results.filter(r => r.result === "updated").length,
            skipped: results.filter(r => r.result === "duplicate" || r.result === "skipped").length,
            errors: results.filter(r => r.result === "error" || r.result === "unsupported").length,
        };

        await writeAuditLog({
            user_id: req.user.id,
            action: "SYNC_BATCH",
            resource_type: "sync",
            resource_id: null,
            metadata: summary,
            ip_address: req.ip,
        });

        return sendSuccess(res, 200, "Batch sync processed.", {
            summary,
            results,
        });
    } catch (error) {
        next(error);
    }
};
