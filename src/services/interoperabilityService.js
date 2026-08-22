/**
 * Interoperability Service — Rural CareLink
 *
 * Maps internal records to/from FHIR-compatible representations.
 *
 * FHIR R4 mapping is used as a structural model. This does NOT claim
 * full ABDM certification or live FHIR server integration unless
 * FHIR_SERVER_URL is configured and tested.
 *
 * Architecture:
 *   internal record → mapToFhir*() → FHIR-compatible JSON
 *   FHIR-compatible JSON → mapFromFhir*() → internal insert payload
 *
 * Access control:
 *   Enforced at controller level (authenticate + authorize).
 *   The service layer assumes it receives validated, authorized data.
 *
 * Audit:
 *   All import/export events should be audited at the controller level.
 */

// ─── Internal → FHIR-compatible Mappers ──────────────────────────────────

/**
 * mapPatientToFhir — maps an internal patient record to FHIR R4 Patient resource.
 * @param {object} patient - Internal patient row (with joined user fields)
 * @returns {object} FHIR R4 Patient resource
 */
export function mapPatientToFhir(patient) {
    const resource = {
        resourceType: "Patient",
        id: String(patient.id),
        meta: {
            source: "rural-carelink",
            lastUpdated: patient.updated_at || patient.created_at,
        },
        identifier: [
            {
                system: "urn:rural-carelink:patient",
                value: String(patient.id),
            },
        ],
        active: true,
    };

    if (patient.full_name) {
        resource.name = [{ text: patient.full_name }];
    }

    if (patient.date_of_birth) {
        resource.birthDate = patient.date_of_birth instanceof Date
            ? patient.date_of_birth.toISOString().split("T")[0]
            : String(patient.date_of_birth).split("T")[0];
    }

    if (patient.gender) {
        // FHIR gender: male | female | other | unknown
        const genderMap = { male: "male", female: "female", other: "other" };
        resource.gender = genderMap[patient.gender.toLowerCase()] || "unknown";
    }

    if (patient.blood_group) {
        resource.extension = [
            {
                url: "http://hl7.org/fhir/StructureDefinition/patient-bloodGroup",
                valueCodeableConcept: { text: patient.blood_group },
            },
        ];
    }

    if (patient.address || patient.district) {
        resource.address = [
            {
                text: patient.address || undefined,
                district: patient.district || undefined,
                country: "IN",
            },
        ];
    }

    if (patient.phone) {
        resource.telecom = [{ system: "phone", value: patient.phone }];
    }
    if (patient.email) {
        if (!resource.telecom) resource.telecom = [];
        resource.telecom.push({ system: "email", value: patient.email });
    }

    if (patient.known_conditions) {
        resource.extension = resource.extension || [];
        resource.extension.push({
            url: "urn:rural-carelink:known-conditions",
            valueString: patient.known_conditions,
        });
    }

    return resource;
}

/**
 * mapMedicalRecordToFhir — maps an internal medical record to FHIR R4 Encounter + Observation.
 * @param {object} record - Internal medical_records row
 * @returns {object} Simplified FHIR-compatible bundle entry
 */
export function mapMedicalRecordToFhir(record) {
    const entry = {
        resourceType: "Encounter",
        id: String(record.id),
        meta: {
            source: "rural-carelink",
            lastUpdated: record.created_at,
        },
        status: "finished",
        subject: { reference: `Patient/${record.patient_id}` },
        period: {
            start: record.visit_date || record.created_at,
        },
    };

    if (record.facility_name) {
        entry.serviceProvider = { display: record.facility_name };
    }

    if (record.doctor_name) {
        entry.participant = [
            {
                individual: { display: record.doctor_name },
                type: [{ coding: [{ code: "PPRF", display: "Primary Performer" }] }],
            },
        ];
    }

    // Attach clinical notes as a note extension
    if (record.symptoms || record.clinical_notes || record.assessment) {
        entry.extension = [
            record.symptoms && {
                url: "urn:rural-carelink:symptoms",
                valueString: record.symptoms,
            },
            record.clinical_notes && {
                url: "urn:rural-carelink:clinical-notes",
                valueString: record.clinical_notes,
            },
            record.assessment && {
                url: "urn:rural-carelink:assessment",
                valueString: record.assessment,
            },
        ].filter(Boolean);
    }

    return entry;
}

/**
 * mapReferralToFhir — maps an internal referral to a FHIR R4 ServiceRequest.
 * @param {object} referral - Internal referrals row
 * @returns {object} FHIR R4 ServiceRequest resource
 */
export function mapReferralToFhir(referral) {
    const statusMap = {
        created: "draft",
        sent: "active",
        accepted: "active",
        appointment: "active",
        consulted: "completed",
        treatment: "active",
        follow_up: "active",
        completed: "completed",
    };

    return {
        resourceType: "ServiceRequest",
        id: String(referral.id),
        meta: { source: "rural-carelink" },
        status: statusMap[referral.status] || "draft",
        intent: "referral",
        subject: { reference: `Patient/${referral.patient_id}` },
        identifier: [
            {
                system: "urn:rural-carelink:referral-code",
                value: referral.referral_code,
            },
        ],
        priority: referral.priority === "emergency" ? "stat" : referral.priority || "routine",
        note: referral.reason ? [{ text: referral.reason }] : undefined,
        requester: referral.from_facility_name
            ? { display: referral.from_facility_name }
            : undefined,
        performer: referral.to_facility_name
            ? [{ display: referral.to_facility_name }]
            : undefined,
    };
}

// ─── FHIR-compatible → Internal Mappers ──────────────────────────────────

/**
 * validateFhirPatient — validates minimal FHIR Patient payload for import.
 * @param {object} payload
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateFhirPatient(payload) {
    const errors = [];

    if (!payload || typeof payload !== "object") {
        errors.push("Payload must be a JSON object.");
        return { valid: false, errors };
    }
    if (payload.resourceType !== "Patient") {
        errors.push(`Expected resourceType 'Patient', got '${payload.resourceType}'.`);
    }

    return { valid: errors.length === 0, errors };
}

/**
 * mapFhirPatientToInternal — converts a FHIR Patient resource to internal insert payload.
 * @param {object} fhirPatient
 * @returns {object} Partial patients table insert payload
 */
export function mapFhirPatientToInternal(fhirPatient) {
    const internal = {};

    if (fhirPatient.birthDate) {
        internal.date_of_birth = fhirPatient.birthDate;
    }

    if (fhirPatient.gender) {
        const genderMap = { male: "male", female: "female", other: "other", unknown: "other" };
        internal.gender = genderMap[fhirPatient.gender] || "other";
    }

    if (fhirPatient.address && fhirPatient.address[0]) {
        internal.address = fhirPatient.address[0].text || null;
        internal.district = fhirPatient.address[0].district || null;
    }

    // Extract known conditions from extensions
    if (Array.isArray(fhirPatient.extension)) {
        const condExt = fhirPatient.extension.find(
            e => e.url === "urn:rural-carelink:known-conditions"
        );
        if (condExt) internal.known_conditions = condExt.valueString;

        const bgExt = fhirPatient.extension.find(
            e => e.url === "http://hl7.org/fhir/StructureDefinition/patient-bloodGroup"
        );
        if (bgExt?.valueCodeableConcept?.text) {
            internal.blood_group = bgExt.valueCodeableConcept.text;
        }
    }

    return internal;
}

/**
 * buildFhirBundle — wraps multiple FHIR resources in a searchset Bundle.
 * @param {object[]} entries
 * @returns {object} FHIR Bundle
 */
export function buildFhirBundle(entries) {
    return {
        resourceType: "Bundle",
        type: "searchset",
        total: entries.length,
        timestamp: new Date().toISOString(),
        entry: entries.map(resource => ({
            resource,
            fullUrl: `urn:rural-carelink:${resource.resourceType}/${resource.id}`,
        })),
    };
}
