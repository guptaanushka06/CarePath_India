/**
 * Notification Service — Rural CareLink
 *
 * Provider-agnostic abstraction for SMS / Email / WhatsApp notifications.
 *
 * Architecture:
 *   notificationService  ← called by controllers / other services
 *         ↓
 *   getProvider()        ← selects real or mock provider based on env
 *         ↓
 *   mockProvider         ← always available, logs intent without real sending
 *   twilioProvider       ← activated when TWILIO_* env vars are present
 *   emailProvider        ← activated when SMTP_* env vars are present
 *
 * IMPORTANT:
 *   - Never pretend a notification was sent if no provider is configured.
 *   - Always return a clear provider_status in the result.
 *   - Do NOT log patient PII beyond what is absolutely necessary for debugging.
 */

// ─── Provider Implementations ─────────────────────────────────────────────

/**
 * Mock provider — used when no real provider is configured.
 * Logs the intent and returns a queued status so the system
 * remains testable without real credentials.
 */
const mockProvider = {
    name: "mock",

    async send({ to, type, subject, body }) {
        console.log(`[NotificationService][mock] Would send '${type}' to '${to}': ${subject}`);
        return {
            success: true,
            provider: "mock",
            status: "queued",
            message: "Notification queued in mock mode. No real message was sent.",
        };
    },
};

/**
 * Twilio SMS provider — activated when TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are present.
 *
 * NOTE: The actual Twilio package is NOT installed to avoid unnecessary
 * dependencies. This uses the Twilio REST API directly via fetch.
 */
const twilioProvider = {
    name: "twilio_sms",

    isConfigured() {
        return !!(
            process.env.TWILIO_ACCOUNT_SID &&
            process.env.TWILIO_AUTH_TOKEN &&
            process.env.TWILIO_FROM_NUMBER
        );
    },

    async send({ to, type, subject, body }) {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        const from = process.env.TWILIO_FROM_NUMBER;

        try {
            const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
            const credentials = Buffer.from(`${sid}:${token}`).toString("base64");
            const params = new URLSearchParams({
                From: from,
                To: to,
                Body: `${subject}\n${body}`,
            });

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Basic ${credentials}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: params.toString(),
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                console.warn("[NotificationService][twilio] Send failed:", err.message || response.status);
                return {
                    success: false,
                    provider: "twilio_sms",
                    status: "failed",
                    message: err.message || "Twilio send failed.",
                };
            }

            const data = await response.json();
            return {
                success: true,
                provider: "twilio_sms",
                status: "sent",
                sid: data.sid,
            };
        } catch (err) {
            console.warn("[NotificationService][twilio] Error:", err.message);
            return {
                success: false,
                provider: "twilio_sms",
                status: "failed",
                message: err.message,
            };
        }
    },
};

// ─── Provider Selection ────────────────────────────────────────────────────

function getProvider() {
    if (twilioProvider.isConfigured()) return twilioProvider;
    return mockProvider;
}

// ─── Internal Send Helper ─────────────────────────────────────────────────

async function send(payload) {
    const provider = getProvider();
    try {
        return await provider.send(payload);
    } catch (err) {
        console.error("[NotificationService] Unexpected error:", err.message);
        return {
            success: false,
            provider: provider.name,
            status: "error",
            message: "Notification service encountered an unexpected error.",
        };
    }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * sendAppointmentReminder — remind a patient of an upcoming appointment
 * @param {{ to: string, patientName: string, appointmentDate: string, facilityName: string }} params
 */
export async function sendAppointmentReminder({ to, patientName, appointmentDate, facilityName }) {
    return send({
        to,
        type: "appointment_reminder",
        subject: "Rural CareLink: Appointment Reminder",
        body: `Dear ${patientName}, your appointment is scheduled on ${appointmentDate} at ${facilityName}. Please arrive 15 minutes early. This is an automated reminder from Rural CareLink.`,
    });
}

/**
 * sendReferralUpdate — inform patient/health worker of a referral status change
 * @param {{ to: string, patientName: string, status: string, facilityName: string }} params
 */
export async function sendReferralUpdate({ to, patientName, status, facilityName }) {
    return send({
        to,
        type: "referral_update",
        subject: "Rural CareLink: Referral Status Update",
        body: `Dear ${patientName}, your referral status has been updated to '${status}' at ${facilityName}. Please contact your health worker for next steps.`,
    });
}

/**
 * sendFollowupReminder — remind patient/health worker of a scheduled follow-up
 * @param {{ to: string, patientName: string, followupDate: string, reason: string }} params
 */
export async function sendFollowupReminder({ to, patientName, followupDate, reason }) {
    return send({
        to,
        type: "followup_reminder",
        subject: "Rural CareLink: Follow-up Reminder",
        body: `Dear ${patientName}, you have a follow-up scheduled on ${followupDate}. Reason: ${reason || "Routine follow-up"}. Please visit your nearest health facility.`,
    });
}

/**
 * sendOverdueFollowupAlert — alert health worker about an overdue follow-up
 * @param {{ to: string, workerName: string, patientName: string, dueDate: string }} params
 */
export async function sendOverdueFollowupAlert({ to, workerName, patientName, dueDate }) {
    return send({
        to,
        type: "overdue_followup_alert",
        subject: "Rural CareLink: Overdue Follow-up Alert",
        body: `Dear ${workerName}, patient ${patientName} has a follow-up that was due on ${dueDate} and has not been completed. Please take action.`,
    });
}

/**
 * sendEmergencyAlert — alert about a high/critical risk triage result
 * @param {{ to: string, workerName: string, patientName: string, riskLevel: string, redFlags: string[] }} params
 */
export async function sendEmergencyAlert({ to, workerName, patientName, riskLevel, redFlags }) {
    const flagsSummary = redFlags && redFlags.length > 0
        ? redFlags.slice(0, 3).join("; ")
        : "Elevated clinical risk";

    return send({
        to,
        type: "emergency_alert",
        subject: "Rural CareLink: HIGH RISK — Immediate Attention Required",
        body: `ALERT for ${workerName}: Patient ${patientName} has been flagged as ${riskLevel.toUpperCase()} risk during preliminary triage. Flags: ${flagsSummary}. This is AI-assisted preliminary triage — NOT a diagnosis. Immediate clinical assessment is required.`,
    });
}

/**
 * sendDiagnosticResultNotification — inform patient/doctor of diagnostic availability
 * @param {{ to: string, recipientName: string, testName: string, facilityName: string }} params
 */
export async function sendDiagnosticResultNotification({ to, recipientName, testName, facilityName }) {
    return send({
        to,
        type: "diagnostic_notification",
        subject: "Rural CareLink: Diagnostic Availability Update",
        body: `Dear ${recipientName}, the diagnostic test '${testName}' is now available at ${facilityName}. Please contact your health worker to schedule this test.`,
    });
}

/**
 * sendTeleconsultationInvite — invite participants to a teleconsultation
 * @param {{ to: string, recipientName: string, consultationId: number|string, joinUrl: string, scheduledAt: string }} params
 */
export async function sendTeleconsultationInvite({ to, recipientName, consultationId, joinUrl, scheduledAt }) {
    return send({
        to,
        type: "teleconsultation_invite",
        subject: "Rural CareLink: Teleconsultation Invitation",
        body: `Dear ${recipientName}, you have been invited to a teleconsultation (ID: ${consultationId}) scheduled at ${scheduledAt}. Join using: ${joinUrl || "Contact your health worker for access details."}`,
    });
}

export default {
    sendAppointmentReminder,
    sendReferralUpdate,
    sendFollowupReminder,
    sendOverdueFollowupAlert,
    sendEmergencyAlert,
    sendDiagnosticResultNotification,
    sendTeleconsultationInvite,
};
