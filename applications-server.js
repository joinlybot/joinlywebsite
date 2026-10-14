
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const crypto = require("node:crypto");
const path = require("node:path");

const app = express();

const PORT = Number(process.env.APPLICATIONS_PORT || 3001);
const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_SECRET = process.env.APPLICATIONS_SESSION_SECRET || process.env.SESSION_SECRET;
const APPLICATIONS_PASSCODE = process.env.APPLICATIONS_PASSCODE;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const GUILD_ID = "1528786692050518111";
const STAFF_ROLE_ID = "1530905170639192125";
const DISCORD_API = "https://discord.com/api/v10";

const PUBLIC_DIR = path.join(__dirname, "public");

if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI in .env");
}

if (!SESSION_SECRET) {
    throw new Error("Missing SESSION_SECRET or APPLICATIONS_SESSION_SECRET in .env");
}

if (!APPLICATIONS_PASSCODE) {
    throw new Error("Missing APPLICATIONS_PASSCODE in .env");
}

if (!BOT_TOKEN) {
    throw new Error("Missing DISCORD_BOT_TOKEN in .env");
}

app.set("trust proxy", 1);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

// --------------------------------------------------
// Session storage
// --------------------------------------------------

app.use(
    session({
        name: "joinly.applications.sid",
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: MONGODB_URI,
            collectionName: "application_sessions"
        }),
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 1000 * 60 * 60 * 8
        }
    })
);

// --------------------------------------------------
// MongoDB model
// --------------------------------------------------

const answerSchema = new mongoose.Schema(
    {
        key: { type: String, required: true },
        question: { type: String, default: "" },
        answer: { type: String, default: "" }
    },
    { _id: false }
);

const applicationSchema = new mongoose.Schema(
    {
        discordUsername: {
            type: String,
            required: true
        },
        discordId: {
            type: String,
            required: true,
            index: true
        },
        answers: {
            type: [answerSchema],
            default: []
        },
        status: {
            type: String,
            enum: ["pending", "approved", "denied"],
            default: "pending",
            index: true
        },
        submittedAt: {
            type: Date,
            default: Date.now,
            index: true
        }
    },
    {
        collection: "application_submissions",
        versionKey: false
    }
);

const Application =
    mongoose.models.ApplicationSubmission ||
    mongoose.model("ApplicationSubmission", applicationSchema);

// --------------------------------------------------
// Application questions
// --------------------------------------------------

const QUESTION_LABELS = {
    discord: "What's your Discord username & ID?",
    age: "How old are you?",
    "joinly-time": "How long have you been using Joinly?",
    "why-staff": "Why do you want to be staff?",
    experience: "Do you have experience moderating a Discord server?",
    strengths: "What skills or qualities would make you a good staff member?",
    availability: "How much time can you dedicate to Joinly each week?",
    additional: "Is there anything else you'd like us to know?",
    "scenario-one": "Scenario One",
    "scenario-two": "Scenario Two",
    "scenario-three": "Scenario Three"
};

function normalizeAnswers(input) {
    if (Array.isArray(input)) {
        return input.map(item => {
            const key = String(
                item?.key || item?.id || item?.name || ""
            ).trim();

            const question = String(
                item?.question ||
                item?.label ||
                QUESTION_LABELS[key] ||
                key
            ).trim();

            const answer = String(
                item?.answer ?? item?.value ?? ""
            ).trim();

            return { key, question, answer };
        });
    }

    if (input && typeof input === "object") {
        return Object.entries(input).map(([key, value]) => ({
            key,
            question: QUESTION_LABELS[key] || key,
            answer: String(value ?? "").trim()
        }));
    }

    return [];
}

function extractDiscordId(value) {
    const match = String(value || "").match(/\b\d{17,20}\b/);
    return match ? match[0] : null;
}

function getAnswer(answers, key) {
    return answers.find(answer => answer.key === key)?.answer || "";
}

// --------------------------------------------------
// Discord API helpers
// --------------------------------------------------

async function discordRequest(endpoint, options = {}) {
    const response = await fetch(`${DISCORD_API}${endpoint}`, {
        ...options,
        headers: {
            Authorization: `Bot ${BOT_TOKEN}`,
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const body = await response.text();
    let data = null;

    try {
        data = body ? JSON.parse(body) : null;
    } catch {
        data = body;
    }

    if (!response.ok) {
        const error = new Error(
            data?.message || `Discord API returned ${response.status}`
        );

        error.status = response.status;
        error.data = data;

        throw error;
    }

    return data;
}

async function sendApplicantDM(discordId, content) {
    const channel = await discordRequest("/users/@me/channels", {
        method: "POST",
        body: JSON.stringify({
            recipient_id: discordId
        })
    });

    await discordRequest(`/channels/${channel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content })
    });
}

async function grantStaffRole(discordId) {
    await discordRequest(
        `/guilds/${GUILD_ID}/members/${discordId}/roles/${STAFF_ROLE_ID}`,
        {
            method: "PUT",
            body: JSON.stringify({})
        }
    );
}

// --------------------------------------------------
// Passcode protection and login rate limiting
// --------------------------------------------------

const unlockAttempts = new Map();
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW = 15 * 60 * 1000;

function getClientIp(req) {
    return req.ip || req.socket.remoteAddress || "unknown";
}

function checkPasscode(submitted) {
    const expected = Buffer.from(APPLICATIONS_PASSCODE);
    const actual = Buffer.from(String(submitted || ""));

    return (
        expected.length === actual.length &&
        crypto.timingSafeEqual(expected, actual)
    );
}

function requireApplicationsAccess(req, res, next) {
    if (req.session?.applicationSubmissionsUnlocked !== true) {
        return res.status(401).json({
            error: "Please unlock the applications page first."
        });
    }

    next();
}

app.post("/api/application-submissions/unlock", (req, res) => {
    const ip = getClientIp(req);
    const now = Date.now();

    let attempt = unlockAttempts.get(ip);

    if (!attempt || now - attempt.startedAt > ATTEMPT_WINDOW) {
        attempt = {
            count: 0,
            startedAt: now
        };
    }

    if (attempt.count >= MAX_ATTEMPTS) {
        unlockAttempts.set(ip, attempt);

        return res.status(429).json({
            error: "Too many attempts. Please try again later."
        });
    }

    attempt.count += 1;
    unlockAttempts.set(ip, attempt);

    if (!checkPasscode(req.body?.passcode)) {
        return res.status(401).json({
            error: "Incorrect passcode."
        });
    }

    unlockAttempts.delete(ip);
    req.session.applicationSubmissionsUnlocked = true;

    req.session.save(error => {
        if (error) {
            console.error("[Applications] Session save failed:", error);

            return res.status(500).json({
                error: "Could not start your session."
            });
        }

        res.json({ success: true });
    });
});

// --------------------------------------------------
// Public application submission
// --------------------------------------------------

app.post("/api/applications", async (req, res) => {
    try {
        // Honeypot field for basic spam prevention.
        if (String(req.body?.website || "").trim()) {
            return res.json({
                success: true,
                message: "Application submitted."
            });
        }

        const answers = normalizeAnswers(req.body?.answers);

        const requiredKeys = Object.keys(QUESTION_LABELS);

        const answerMap = new Map(
            answers.map(answer => [answer.key, answer])
        );

        const missing = requiredKeys.filter(key => {
            return !answerMap.get(key)?.answer;
        });

        if (missing.length > 0) {
            return res.status(400).json({
                error: "Please complete all required questions."
            });
        }

        if (answers.length !== requiredKeys.length) {
            return res.status(400).json({
                error: "Invalid application format."
            });
        }

        for (const answer of answers) {
            if (!requiredKeys.includes(answer.key)) {
                return res.status(400).json({
                    error: "Invalid application question."
                });
            }

            if (answer.answer.length > 8000) {
                return res.status(400).json({
                    error: "One of your answers is too long."
                });
            }
        }

        const ageText = getAnswer(answers, "age");
        const age = Number(ageText);

        if (!Number.isInteger(age) || age < 15 || age > 100) {
            return res.status(400).json({
                error: "You must be at least 15 years old to apply."
            });
        }

        const discordAnswer = getAnswer(answers, "discord");
        const discordId = extractDiscordId(discordAnswer);

        if (!discordId) {
            return res.status(400).json({
                error: "Please include your Discord user ID (17–20 digits)."
            });
        }

        const existing = await Application.findOne({
            discordId,
            status: "pending"
        }).lean();

        if (existing) {
            return res.status(409).json({
                error: "You already have a pending application."
            });
        }

        // Keep only the expected fields and labels.
        const cleanAnswers = requiredKeys.map(key => ({
            key,
            question: QUESTION_LABELS[key],
            answer: answerMap.get(key).answer
        }));

        const discordUsername =
            discordAnswer.replace(discordId, "").trim() || discordId;

        await Application.create({
            discordUsername,
            discordId,
            answers: cleanAnswers
        });

        return res.status(201).json({
            success: true,
            message: "Your application has been submitted."
        });
    } catch (error) {
        console.error("[Applications] Submission failed:", error);

        return res.status(500).json({
            error: "Could not submit your application. Please try again."
        });
    }
});

// --------------------------------------------------
// Get pending applications (passcode protected)
// --------------------------------------------------

app.get(
    "/api/application-submissions",
    requireApplicationsAccess,
    async (req, res) => {
        try {
            const applications = await Application.find({
                status: "pending"
            })
                .sort({ submittedAt: -1 })
                .lean();

            res.json({
                applications: applications.map(application => ({
                    id: String(application._id),
                    discordUsername: application.discordUsername,
                    discordId: application.discordId,
                    answers: application.answers,
                    status: application.status,
                    submittedAt: application.submittedAt
                }))
            });
        } catch (error) {
            console.error("[Applications] Fetch failed:", error);

            res.status(500).json({
                error: "Could not load applications."
            });
        }
    }
);

// --------------------------------------------------
// Approve or deny an application
// --------------------------------------------------

app.post(
    "/api/application-submissions/:id/decision",
    requireApplicationsAccess,
    async (req, res) => {
        const { id } = req.params;
        const decision = String(req.body?.decision || "").toLowerCase();

        if (!["approve", "deny"].includes(decision)) {
            return res.status(400).json({
                error: "Decision must be approve or deny."
            });
        }

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                error: "Invalid application ID."
            });
        }

        try {
            const application = await Application.findOne({
                _id: id,
                status: "pending"
            });

            if (!application) {
                return res.status(404).json({
                    error: "Application not found or already processed."
                });
            }

            if (decision === "approve") {
                // Add the role before sending acceptance DM.
                await grantStaffRole(application.discordId);

                await sendApplicantDM(
                    application.discordId,
                    [
                        "🎉 **Your Joinly staff application has been accepted!**",
                        "",
                        "Congratulations! You've been accepted onto the Joinly staff team.",
                        "Please check the support server for next steps."
                    ].join("\n")
                );

                application.status = "approved";
            } else {
                await sendApplicantDM(
                    application.discordId,
                    [
                        "Thank you for applying to the Joinly staff team.",
                        "",
                        "Unfortunately, your application has not been accepted this time.",
                        "We appreciate your interest in helping Joinly and encourage you to apply again in the future."
                    ].join("\n")
                );

                application.status = "denied";
            }

            // Delete only after the requested processing succeeds.
            await Application.deleteOne({
                _id: application._id
            });

            return res.json({
                success: true,
                decision,
                message: decision === "approve"
                    ? "Applicant approved, role granted and DM sent."
                    : "Applicant notified and application removed."
            });
        } catch (error) {
            console.error(
                `[Applications] ${decision} failed for ${id}:`,
                error
            );

            return res.status(500).json({
                error:
                    error.status === 403
                        ? "The bot lacks permission to process this application."
                        : "Could not complete the decision. The application has been kept so you can retry."
            });
        }
    }
);

// --------------------------------------------------
// Staff page logout
// --------------------------------------------------

app.post(
    "/api/application-submissions/logout",
    requireApplicationsAccess,
    (req, res) => {
        req.session.applicationSubmissionsUnlocked = false;

        req.session.save(error => {
            if (error) {
                return res.status(500).json({
                    error: "Could not log out."
                });
            }

            res.json({ success: true });
        });
    }
);

// --------------------------------------------------
// Pages
// --------------------------------------------------

app.get("/applications", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "applications.html"));
});

app.get("/application-submissions", (req, res) => {
    res.sendFile(
        path.join(PUBLIC_DIR, "application-submissions.html")
    );
});

// Optional static assets in public/
app.use(express.static(PUBLIC_DIR));

// --------------------------------------------------
// Error handler
// --------------------------------------------------

app.use((error, req, res, next) => {
    console.error("[Applications] Unhandled error:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        error: "An unexpected server error occurred."
    });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

async function start() {
    await mongoose.connect(MONGODB_URI);

    console.log("[Applications] Connected to MongoDB.");

    app.listen(PORT, "0.0.0.0", () => {
        console.log(
            `[Applications] Server listening on port ${PORT}.`
        );
    });
}

start().catch(error => {
    console.error("[Applications] Failed to start:", error);
    process.exit(1);
});
