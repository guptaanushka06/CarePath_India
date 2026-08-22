/**
 * Audit Middleware — Rural CareLink
 *
 * Provides audit-log integration for Developer 2 operations.
 *
 * IMPORTANT:
 *   - audit_logs table does NOT exist in the current initDB.js schema.
 *   - This middleware gracefully degrades: it logs to console if the
 *     table is unavailable, so it NEVER crashes the healthcare workflow.
 *   - Developer 1 must add the audit_logs table to initDB.js for
 *     full persistence. Schema is documented below.
 *
 * Required schema (for Developer 1 to add to initDB.js):
 *
 *   CREATE TABLE IF NOT EXISTS audit_logs (
 *     id SERIAL PRIMARY KEY,
 *     user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 *     action VARCHAR(100) NOT NULL,
 *     resource_type VARCHAR(100),
 *     resource_id VARCHAR(100),
 *     metadata JSONB,
 *     ip_address VARCHAR(45),
 *     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 *   );
 *
 * NEVER LOG:
 *   - passwords
 *   - JWT secrets
 *   - NEON_URL
 *   - AI API keys
 *   - unnecessary sensitive patient content
 */

import { sql } from "../db.js";

// Track whether audit table has been confirmed to exist
let auditTableConfirmed = null; // null = not checked, true = exists, false = missing

/**
 * Check if the audit_logs table exists (cached after first check).
 */
async function auditTableExists() {
    if (auditTableConfirmed !== null) return auditTableConfirmed;

    try {
        await sql`SELECT 1 FROM audit_logs LIMIT 1`;
        auditTableConfirmed = true;
    } catch {
        auditTableConfirmed = false;
    }

    return auditTableConfirmed;
}

/**
 * writeAuditLog — core function that writes an audit record.
 *
 * If the audit_logs table does not exist yet, falls back to console.log.
 *
 * @param {object} params
 * @param {number|null} params.user_id
 * @param {string} params.action
 * @param {string} [params.resource_type]
 * @param {string|number|null} [params.resource_id]
 * @param {object} [params.metadata] - safe, non-sensitive metadata only
 * @param {string} [params.ip_address]
 */
export async function writeAuditLog({
    user_id,
    action,
    resource_type = null,
    resource_id = null,
    metadata = {},
    ip_address = null,
}) {
    // Sanitize: ensure no secrets leak into audit metadata
    const safeMetadata = { ...metadata };
    delete safeMetadata.password;
    delete safeMetadata.jwt_secret;
    delete safeMetadata.token;
    delete safeMetadata.neon_url;
    delete safeMetadata.ai_api_key;

    const exists = await auditTableExists();

    if (!exists) {
        // Graceful degradation — log to console until table is created
        console.log(
            `[AuditLog][console-fallback] user=${user_id} action=${action} ` +
            `resource=${resource_type}:${resource_id} ip=${ip_address} ` +
            `meta=${JSON.stringify(safeMetadata)}`
        );
        return;
    }

    try {
        const resourceIdStr = resource_id !== null ? String(resource_id) : null;
        const metadataJson = Object.keys(safeMetadata).length > 0
            ? JSON.stringify(safeMetadata)
            : null;

        if (metadataJson) {
            await sql`
                INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata, ip_address)
                VALUES (
                    ${user_id || null},
                    ${action},
                    ${resource_type},
                    ${resourceIdStr},
                    ${metadataJson}::jsonb,
                    ${ip_address}
                )
            `;
        } else {
            await sql`
                INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address)
                VALUES (
                    ${user_id || null},
                    ${action},
                    ${resource_type},
                    ${resourceIdStr},
                    ${ip_address}
                )
            `;
        }
    } catch (err) {
        // Audit failure must NEVER crash the main healthcare flow
        console.error("[AuditLog] Failed to write audit record:", err.message);
    }
}

/**
 * auditLog — Express middleware factory for automatic route-level auditing.
 *
 * Usage:
 *   router.post("/", authenticate, auditLog("AI_TRIAGE_CREATED", "triage"), createTriage);
 *
 * @param {string} action - Audit action label
 * @param {string} [resourceType] - Type of resource being acted on
 */
export function auditLog(action, resourceType = null) {
    return async (req, res, next) => {
        // We audit AFTER the response to capture the resource_id from the response
        // Use a response interception approach
        const originalJson = res.json.bind(res);

        res.json = function (body) {
            // Attempt to extract resource ID from response body
            let resourceId = null;
            try {
                if (body && body.data) {
                    const data = body.data;
                    // Common patterns: data.id, data.patient.id, data.triage.id, etc.
                    resourceId =
                        data.id ||
                        data.triage?.id ||
                        data.record?.id ||
                        data.referral?.id ||
                        data.consultation?.id ||
                        data.followup?.id ||
                        null;
                }
            } catch { /* ignore extraction errors */ }

            // Write audit log (don't await — fire and forget so response isn't delayed)
            writeAuditLog({
                user_id: req.user?.id || null,
                action,
                resource_type: resourceType,
                resource_id: resourceId || req.params?.id || null,
                metadata: {
                    method: req.method,
                    path: req.path,
                    status_code: res.statusCode,
                },
                ip_address: req.ip || req.connection?.remoteAddress || null,
            }).catch(err => console.error("[AuditLog] Async write failed:", err.message));

            return originalJson(body);
        };

        next();
    };
}
