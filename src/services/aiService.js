/**
 * AI Service — AI-Assisted Preliminary Triage / Decision Support
 *
 * IMPORTANT SAFETY NOTICE:
 * This service provides AI-ASSISTED PRELIMINARY TRIAGE only.
 * It does NOT diagnose, prescribe, or replace a licensed doctor.
 * All AI output is decision-support for qualified health workers.
 *
 * Output structure:
 * {
 *   risk_level: "low" | "medium" | "high",
 *   urgency: "routine" | "soon" | "urgent",
 *   recommended_care_level: "sub_centre" | "phc" | "chc" | "district_hospital" | "emergency",
 *   red_flags: string[],
 *   summary: string,
 *   source: "ai" | "fallback"
 * }
 */

const VALID_RISK_LEVELS = ["low", "medium", "high"];
const VALID_URGENCY = ["routine", "soon", "urgent"];
const VALID_CARE_LEVELS = ["sub_centre", "phc", "chc", "district_hospital", "emergency"];

// ─── Red-Flag Keywords ─────────────────────────────────────────────────────

const RED_FLAG_PATTERNS = [
    { pattern: /severe chest pain|chest tightness|crushing chest/i, flag: "Severe chest pain — possible cardiac emergency" },
    { pattern: /cannot breathe|severe difficulty breathing|respiratory distress|gasping/i, flag: "Severe difficulty breathing — possible respiratory emergency" },
    { pattern: /loss of consciousness|unconscious|unresponsive|collapsed/i, flag: "Loss of consciousness — immediate emergency care required" },
    { pattern: /severe bleeding|heavy bleeding|uncontrolled bleeding/i, flag: "Severe or uncontrolled bleeding" },
    { pattern: /stroke|facial droop|arm weakness|slurred speech|sudden numbness/i, flag: "Possible stroke symptoms — time-critical emergency" },
    { pattern: /convulsions|seizure|fitting/i, flag: "Convulsions or seizure activity" },
    { pattern: /anaphylaxis|severe allergic|throat swelling/i, flag: "Possible anaphylaxis — immediate emergency required" },
    { pattern: /suicidal|self harm|wanting to die/i, flag: "Psychiatric emergency — risk of self-harm" },
    { pattern: /high fever.*child|child.*high fever|infant.*fever|newborn.*fever/i, flag: "High fever in infant or young child" },
    { pattern: /pregnancy.*bleeding|bleeding.*pregnant|placenta/i, flag: "Bleeding in pregnancy — obstetric emergency" },
    { pattern: /eclampsia|preeclampsia|high bp.*pregnant/i, flag: "Hypertension in pregnancy — possible eclampsia" },
    { pattern: /poisoning|overdose|swallowed.*chemical/i, flag: "Possible poisoning or overdose" },
    { pattern: /severe dehydration|not passing urine|sunken eyes.*child/i, flag: "Severe dehydration" },
    { pattern: /head injury|head trauma|skull fracture/i, flag: "Head injury — neurological monitoring required" },
];

// ─── Vitals Thresholds for Fallback Risk Assessment ───────────────────────

function assessVitals(vitals = {}) {
    const flags = [];
    let highRisk = false;
    let mediumRisk = false;

    const spo2 = parseFloat(vitals.spo2 || vitals.oxygen_saturation || 100);
    const heartRate = parseFloat(vitals.heart_rate || vitals.pulse || 80);
    const systolic = parseFloat(vitals.systolic_bp || vitals.blood_pressure_systolic || 120);
    const diastolic = parseFloat(vitals.diastolic_bp || vitals.blood_pressure_diastolic || 80);
    const temperature = parseFloat(vitals.temperature || vitals.temp || 98.6);
    const respiratoryRate = parseFloat(vitals.respiratory_rate || vitals.rr || 18);

    // SpO2
    if (spo2 < 90) {
        flags.push("Critical SpO2 < 90% — severe hypoxia");
        highRisk = true;
    } else if (spo2 < 94) {
        flags.push("SpO2 < 94% — hypoxia, supplemental oxygen needed");
        mediumRisk = true;
    }

    // Heart Rate
    if (heartRate < 40 || heartRate > 150) {
        flags.push(`Extreme heart rate (${heartRate} bpm) — possible arrhythmia`);
        highRisk = true;
    } else if (heartRate < 50 || heartRate > 120) {
        flags.push(`Abnormal heart rate (${heartRate} bpm)`);
        mediumRisk = true;
    }

    // Blood Pressure
    if (systolic > 180 || diastolic > 110) {
        flags.push(`Hypertensive crisis — BP ${systolic}/${diastolic} mmHg`);
        highRisk = true;
    } else if (systolic < 90) {
        flags.push(`Hypotension — BP ${systolic} mmHg systolic`);
        highRisk = true;
    } else if (systolic > 140 || diastolic > 90) {
        flags.push(`Elevated blood pressure — ${systolic}/${diastolic} mmHg`);
        mediumRisk = true;
    }

    // Temperature (Celsius or Fahrenheit detection)
    const tempC = temperature > 50 ? (temperature - 32) * 5 / 9 : temperature;
    if (tempC > 40) {
        flags.push(`Hyperpyrexia — temperature ${tempC.toFixed(1)}°C`);
        highRisk = true;
    } else if (tempC < 35) {
        flags.push(`Hypothermia — temperature ${tempC.toFixed(1)}°C`);
        highRisk = true;
    } else if (tempC > 38.5) {
        flags.push(`High fever — temperature ${tempC.toFixed(1)}°C`);
        mediumRisk = true;
    }

    // Respiratory Rate
    if (respiratoryRate < 8 || respiratoryRate > 30) {
        flags.push(`Abnormal respiratory rate (${respiratoryRate}/min)`);
        highRisk = true;
    } else if (respiratoryRate > 24) {
        flags.push(`Tachypnea — respiratory rate ${respiratoryRate}/min`);
        mediumRisk = true;
    }

    return { flags, highRisk, mediumRisk };
}

// ─── Symptom Assessment for Fallback ──────────────────────────────────────

function assessSymptoms(symptoms) {
    const symptomText = typeof symptoms === "string"
        ? symptoms
        : Array.isArray(symptoms)
            ? symptoms.join(" ")
            : JSON.stringify(symptoms);

    const redFlags = [];
    let highRisk = false;
    let mediumRisk = false;

    for (const { pattern, flag } of RED_FLAG_PATTERNS) {
        if (pattern.test(symptomText)) {
            redFlags.push(flag);
            highRisk = true;
        }
    }

    // Medium-risk patterns
    const mediumPatterns = [
        /chest pain/i, /difficulty breathing/i, /shortness of breath/i,
        /severe headache/i, /persistent vomiting/i, /severe diarrhea/i,
        /high fever/i, /unable to walk/i, /confusion/i, /disorientation/i,
        /jaundice/i, /swollen abdomen/i, /severe pain/i,
    ];

    for (const pattern of mediumPatterns) {
        if (pattern.test(symptomText) && !highRisk) {
            mediumRisk = true;
            break;
        }
    }

    return { redFlags, highRisk, mediumRisk };
}

// ─── Determine care level from risk ───────────────────────────────────────

function determineCareLevel(riskLevel, urgency) {
    if (riskLevel === "high" && urgency === "urgent") return "emergency";
    if (riskLevel === "high") return "district_hospital";
    if (riskLevel === "medium" && urgency === "urgent") return "chc";
    if (riskLevel === "medium") return "phc";
    return "sub_centre";
}

// ─── Safe Deterministic Fallback ──────────────────────────────────────────

function deterministicFallback(symptoms, vitals) {
    const symptomResult = assessSymptoms(symptoms);
    const vitalsResult = assessVitals(vitals);

    const allRedFlags = [...symptomResult.redFlags, ...vitalsResult.flags];
    const isHighRisk = symptomResult.highRisk || vitalsResult.highRisk;
    const isMediumRisk = symptomResult.mediumRisk || vitalsResult.mediumRisk;

    let risk_level, urgency;

    if (isHighRisk || allRedFlags.length >= 2) {
        risk_level = "high";
        urgency = "urgent";
    } else if (isMediumRisk || allRedFlags.length === 1) {
        risk_level = "medium";
        urgency = "soon";
    } else {
        risk_level = "low";
        urgency = "routine";
    }

    const recommended_care_level = determineCareLevel(risk_level, urgency);

    return {
        risk_level,
        urgency,
        recommended_care_level,
        red_flags: allRedFlags,
        summary:
            "DEMO DECISION-SUPPORT FALLBACK — NOT MEDICAL DIAGNOSIS. " +
            "This is an AI-assisted preliminary triage result generated without live AI provider access. " +
            "A qualified health worker or doctor must review this patient in person. " +
            `Preliminary assessment: ${risk_level} risk, ${urgency} care recommended at ${recommended_care_level.replace("_", " ")} level.`,
        source: "fallback",
    };
}

// ─── Validate AI JSON response ─────────────────────────────────────────────

function validateAiResponse(parsed) {
    if (typeof parsed !== "object" || parsed === null) return false;
    if (!VALID_RISK_LEVELS.includes(parsed.risk_level)) return false;
    if (!VALID_URGENCY.includes(parsed.urgency)) return false;
    if (!VALID_CARE_LEVELS.includes(parsed.recommended_care_level)) return false;
    if (!Array.isArray(parsed.red_flags)) return false;
    return true;
}

// ─── Attempt AI provider call ──────────────────────────────────────────────

async function callAiProvider(symptoms, vitals) {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey || apiKey === "your_ai_api_key" || apiKey.trim() === "") {
        return null; // No provider configured
    }

    const symptomText = typeof symptoms === "string"
        ? symptoms
        : Array.isArray(symptoms)
            ? symptoms.join(", ")
            : JSON.stringify(symptoms);

    const vitalsText = vitals ? JSON.stringify(vitals) : "Not provided";

    const systemPrompt = `You are an AI-assisted preliminary triage tool for rural healthcare in India.
You are NOT a doctor. You do NOT diagnose or prescribe.
You provide PRELIMINARY TRIAGE DECISION SUPPORT ONLY for trained health workers.
Always respond with ONLY a valid JSON object — no markdown, no explanation.`;

    const userPrompt = `Patient Symptoms: ${symptomText}
Patient Vitals: ${vitalsText}

Based on this information, provide AI-assisted preliminary triage.
Respond ONLY with valid JSON in this exact structure:
{
  "risk_level": "low" | "medium" | "high",
  "urgency": "routine" | "soon" | "urgent",
  "recommended_care_level": "sub_centre" | "phc" | "chc" | "district_hospital" | "emergency",
  "red_flags": ["flag1", "flag2"],
  "summary": "Brief clinical summary for health worker. State clearly this is AI-assisted preliminary triage, not diagnosis."
}`;

    try {
        // Use Gemini API if key starts with typical Gemini prefix, else try OpenAI-compatible format
        const isGemini = apiKey.startsWith("AIza");

        if (isGemini) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            const body = {
                contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
            };

            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(15000),
            });

            if (!response.ok) {
                console.warn(`[aiService] Gemini API error: ${response.status}`);
                return null;
            }

            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;

            const parsed = JSON.parse(jsonMatch[0]);
            if (!validateAiResponse(parsed)) return null;

            return { ...parsed, source: "ai" };
        } else {
            // OpenAI-compatible endpoint
            const url = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
            const body = {
                model: process.env.AI_MODEL || "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.1,
                max_tokens: 512,
                response_format: { type: "json_object" },
            };

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(15000),
            });

            if (!response.ok) {
                console.warn(`[aiService] AI API error: ${response.status}`);
                return null;
            }

            const data = await response.json();
            const text = data?.choices?.[0]?.message?.content || "";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;

            const parsed = JSON.parse(jsonMatch[0]);
            if (!validateAiResponse(parsed)) return null;

            return { ...parsed, source: "ai" };
        }
    } catch (err) {
        console.warn("[aiService] Provider call failed:", err.message);
        return null;
    }
}

// ─── Main Export ──────────────────────────────────────────────────────────

/**
 * performTriage — AI-Assisted Preliminary Triage
 *
 * @param {string|string[]|object} symptoms - Patient symptoms
 * @param {object} vitals - Patient vitals (optional)
 * @returns {Promise<{risk_level, urgency, recommended_care_level, red_flags, summary, source}>}
 *
 * SAFETY: This is preliminary decision support only. Never claims diagnosis.
 */
export async function performTriage(symptoms, vitals = {}) {
    try {
        // Attempt live AI provider
        const aiResult = await callAiProvider(symptoms, vitals);
        if (aiResult) {
            return aiResult;
        }
    } catch (err) {
        console.warn("[aiService] AI provider unavailable, using fallback:", err.message);
    }

    // Safe deterministic fallback
    return deterministicFallback(symptoms, vitals);
}

// ─── AI Medical Summary ────────────────────────────────────────────────────

/**
 * generateSummary — Summarises a patient's longitudinal record for a doctor/health worker.
 *
 * SAFETY:
 *   - Summary is generated ONLY from provided data. No facts are invented.
 *   - Clearly marked as AI-assisted summary, not diagnosis.
 *   - Uses live AI provider if configured, otherwise returns structured fallback.
 *
 * @param {object} patientData
 * @param {object} patientData.patient - Patient demographics
 * @param {object[]} patientData.records - Medical records array
 * @param {object[]} patientData.triage - Triage records array
 * @param {object[]} patientData.referrals - Referral records array
 * @param {object[]} patientData.followups - Follow-up records array
 * @returns {Promise<object>} Structured summary
 */
export async function generateSummary({ patient, records = [], triage = [], referrals = [], followups = [] }) {
    const apiKey = process.env.AI_API_KEY;
    const hasProvider = apiKey && apiKey !== "your_ai_api_key" && apiKey.trim() !== "";

    // Build a structured text representation of the patient's history
    const patientInfo = patient
        ? `Patient: ${patient.full_name || "Unknown"}, DOB: ${patient.date_of_birth || "N/A"}, Gender: ${patient.gender || "N/A"}, Known Conditions: ${patient.known_conditions || "None recorded"}`
        : "Patient demographics not available.";

    const recordsSummary = records.length > 0
        ? records.slice(0, 5).map(r =>
            `Visit ${r.visit_date ? new Date(r.visit_date).toISOString().split("T")[0] : "N/A"}: ` +
            `Symptoms: ${r.symptoms || "N/A"}, Assessment: ${r.assessment || "N/A"}, ` +
            `Prescription: ${r.prescription || "N/A"}`
        ).join("; ")
        : "No medical records found.";

    const triageSummary = triage.length > 0
        ? `Latest triage: Risk=${triage[0].risk_level}, Urgency=${triage[0].urgency}, Care level=${triage[0].recommended_care_level}`
        : "No triage records found.";

    const followupSummary = followups.filter(f => f.status === "pending").slice(0, 3).map(f =>
        `Follow-up due ${f.followup_date}: ${f.reason || "N/A"} (${f.status})`
    ).join("; ") || "No pending follow-ups.";

    if (hasProvider) {
        try {
            const isGemini = apiKey.startsWith("AIza");
            const prompt = `You are an AI medical summary assistant for rural healthcare in India.
You summarise patient records to assist doctors and health workers.
You do NOT diagnose or prescribe. You help with information only.
Based on the following patient data, provide a concise structured summary.
Respond ONLY with valid JSON in this exact structure:
{
  "summary": "2-3 sentence overview",
  "key_conditions": ["condition1"],
  "recent_visits": ["date: summary"],
  "recent_symptoms": ["symptom1"],
  "medications_or_prescriptions": ["med1"],
  "risk_flags": ["flag1"],
  "followup_items": ["item1"]
}

Patient Data:
${patientInfo}
Recent Records: ${recordsSummary}
Triage: ${triageSummary}
Follow-ups: ${followupSummary}`;

            let text = "";

            if (isGemini) {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
                const body = {
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
                };
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(15000),
                });
                if (response.ok) {
                    const data = await response.json();
                    text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
                }
            } else {
                const url = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
                const body = {
                    model: process.env.AI_MODEL || "gpt-4o-mini",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    max_tokens: 512,
                    response_format: { type: "json_object" },
                };
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(15000),
                });
                if (response.ok) {
                    const data = await response.json();
                    text = data?.choices?.[0]?.message?.content || "";
                }
            }

            if (text) {
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    // Validate required fields
                    if (parsed.summary && Array.isArray(parsed.key_conditions)) {
                        return {
                            ...parsed,
                            source: "ai",
                            disclaimer:
                                "This is an AI-assisted summary for decision support only. " +
                                "It is NOT a medical diagnosis. A qualified health professional must assess this patient.",
                        };
                    }
                }
            }
        } catch (err) {
            console.warn("[aiService] generateSummary AI provider failed:", err.message);
        }
    }

    // Deterministic structured fallback — no AI facts invented
    const keyConditions = [];
    if (patient?.known_conditions) keyConditions.push(patient.known_conditions);
    if (triage.length > 0 && triage[0].red_flags) {
        const flags = Array.isArray(triage[0].red_flags) ? triage[0].red_flags : [];
        keyConditions.push(...flags.slice(0, 2));
    }

    const recentVisits = records.slice(0, 3).map(r =>
        `${r.visit_date ? new Date(r.visit_date).toISOString().split("T")[0] : "N/A"}: ${r.symptoms || "Visit recorded"}`
    );

    const recentSymptoms = [...new Set(records.slice(0, 5).map(r => r.symptoms).filter(Boolean))];

    const medications = [...new Set(records.slice(0, 5).map(r => r.prescription).filter(Boolean))];

    const riskFlags = triage.length > 0 && triage[0].risk_level === "high"
        ? [`High-risk triage (${triage[0].urgency}): ${triage[0].recommended_care_level} care recommended`]
        : [];

    const followupItems = followups.filter(f => f.status === "pending").slice(0, 3).map(f =>
        `Follow-up due ${f.followup_date}: ${f.reason || "Routine"}`
    );

    return {
        summary:
            `AI-assisted summary (fallback mode — no AI provider). ` +
            `Patient has ${records.length} medical record(s), ${triage.length} triage record(s), ` +
            `${followups.filter(f => f.status === "pending").length} pending follow-up(s). ` +
            `Review full records for clinical assessment.`,
        key_conditions: keyConditions,
        recent_visits: recentVisits,
        recent_symptoms: recentSymptoms,
        medications_or_prescriptions: medications,
        risk_flags: riskFlags,
        followup_items: followupItems,
        source: "fallback",
        disclaimer:
            "This is an AI-assisted summary for decision support only. " +
            "It is NOT a medical diagnosis. A qualified health professional must assess this patient.",
    };
}

// ─── Multilingual Processing ───────────────────────────────────────────────

/**
 * translateText — Translates text between languages for clinical workflow support.
 *
 * SAFETY:
 *   - Medical information is translated as faithfully as possible.
 *   - Translations are flagged as AI-assisted — human review required.
 *   - Supported languages depend on the configured AI provider.
 *   - Does NOT invent clinical meaning.
 *
 * @param {string} text - Text to translate
 * @param {string} sourceLanguage - Source language code (e.g., "hi", "en", "mr")
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<object>} Translation result
 */
export async function translateText(text, sourceLanguage = "auto", targetLanguage = "en") {
    if (!text || typeof text !== "string" || text.trim() === "") {
        return {
            success: false,
            error: "Text is required for translation.",
        };
    }

    const apiKey = process.env.AI_API_KEY;
    const hasProvider = apiKey && apiKey !== "your_ai_api_key" && apiKey.trim() !== "";

    if (!hasProvider) {
        return {
            success: false,
            source_text: text,
            source_language: sourceLanguage,
            target_language: targetLanguage,
            translated_text: null,
            source: "fallback",
            message:
                "No AI provider configured. Translation requires an active AI_API_KEY. " +
                "The original text is returned unchanged.",
            disclaimer: "AI translation is decision support only. Medical information must be reviewed by a qualified professional.",
        };
    }

    const langMap = { hi: "Hindi", en: "English", mr: "Marathi", ta: "Tamil", te: "Telugu", kn: "Kannada", auto: "auto-detect" };
    const sourceLangName = langMap[sourceLanguage] || sourceLanguage;
    const targetLangName = langMap[targetLanguage] || targetLanguage;

    const prompt = `You are a medical translation assistant for rural healthcare in India.
Translate the following clinical text accurately from ${sourceLangName} to ${targetLangName}.
Do NOT change medical meaning. Do NOT diagnose or prescribe.
Respond ONLY with valid JSON: {"translated_text": "...", "detected_language": "..."}

Text to translate:
${text}`;

    try {
        const isGemini = apiKey.startsWith("AIza");
        let responseText = "";

        if (isGemini) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            const body = {
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
            };
            const resp = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(15000),
            });
            if (resp.ok) {
                const data = await resp.json();
                responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            }
        } else {
            const url = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
            const body = {
                model: process.env.AI_MODEL || "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
                max_tokens: 512,
                response_format: { type: "json_object" },
            };
            const resp = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(15000),
            });
            if (resp.ok) {
                const data = await resp.json();
                responseText = data?.choices?.[0]?.message?.content || "";
            }
        }

        if (responseText) {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.translated_text) {
                    return {
                        success: true,
                        source_text: text,
                        source_language: sourceLanguage,
                        target_language: targetLanguage,
                        detected_language: parsed.detected_language || sourceLanguage,
                        translated_text: parsed.translated_text,
                        source: "ai",
                        disclaimer: "AI translation is decision support only. Medical information must be reviewed by a qualified professional.",
                    };
                }
            }
        }

        throw new Error("AI returned no usable translation.");
    } catch (err) {
        console.warn("[aiService] translateText failed:", err.message);
        return {
            success: false,
            source_text: text,
            source_language: sourceLanguage,
            target_language: targetLanguage,
            translated_text: null,
            source: "ai_error",
            message: "Translation failed. Please try again or use the original text.",
            disclaimer: "AI translation is decision support only.",
        };
    }
}
