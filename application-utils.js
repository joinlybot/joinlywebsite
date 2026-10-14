const crypto = require('node:crypto');
const mongoose = require('mongoose');

const QUESTION_LABELS = {
  discord: "What's your Discord username & ID?",
  age: 'How old are you?',
  'joinly-time': 'How long have you been using Joinly?',
  'why-staff': 'Why do you want to be staff?',
  experience: 'Do you have experience moderating a Discord server?',
  strengths: 'What skills or qualities would make you a good staff member?',
  availability: 'How much time can you dedicate to Joinly each week?',
  additional: "Is there anything else you'd like us to know?",
  'scenario-one': 'Scenario 1: A user publicly claims Joinly is broken, insults staff, and other members join in. What would you do?',
  'scenario-two': 'Scenario 2: A friend asks you to ignore a rule violation because you know them well. How would you handle it?',
  'scenario-three': 'Scenario 3: You receive several reports at once, including one that may involve a serious safety concern. How would you prioritise them?'
};

const answerSchema = new mongoose.Schema({
  key: { type: String, required: true },
  question: { type: String, default: '' },
  answer: { type: String, default: '' }
}, { _id: false });

const applicationSchema = new mongoose.Schema({
  discordUsername: { type: String, required: true },
  discordId: { type: String, required: true, index: true },
  answers: { type: [answerSchema], default: [] },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending', index: true },
  submittedAt: { type: Date, default: Date.now, index: true }
}, { collection: 'application_submissions', versionKey: false });

const Application = mongoose.models.JoinlyApplication || mongoose.model('JoinlyApplication', applicationSchema);

async function connectDb() {
  if (!process.env.MONGODB_URI) throw new Error('Missing MONGODB_URI environment variable.');
  if (mongoose.connection.readyState === 1) return;
  if (!global.__joinlyApplicationsMongoPromise) {
    global.__joinlyApplicationsMongoPromise = mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false
    }).catch(error => {
      global.__joinlyApplicationsMongoPromise = null;
      throw error;
    });
  }
  await global.__joinlyApplicationsMongoPromise;
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return json(res, 405, { error: 'Method not allowed.' });
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

function accessSecret() {
  const secret = process.env.APPLICATIONS_SESSION_SECRET || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('Set APPLICATIONS_SESSION_SECRET to a random secret of at least 32 characters.');
  return secret;
}

function createAccessToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', accessSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function hasAccess(req) {
  try {
    const token = getCookie(req, 'joinly_app_access');
    if (!token) return false;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
    const expected = crypto.createHmac('sha256', accessSecret()).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(data.exp) && data.exp > Date.now();
  } catch {
    return false;
  }
}

function setAccessCookie(res) {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  res.setHeader('Set-Cookie', `joinly_app_access=${encodeURIComponent(createAccessToken())}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800${secure ? '; Secure' : ''}`);
}

function clearAccessCookie(res) {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  res.setHeader('Set-Cookie', `joinly_app_access=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
}

function requireAccess(req, res) {
  if (hasAccess(req)) return true;
  json(res, 401, { error: 'Please unlock the applications page first.' });
  return false;
}

function sameOriginIfProvided(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (originUrl.host !== host) {
      json(res, 403, { error: 'Cross-origin request blocked.' });
      return false;
    }
    return true;
  } catch {
    json(res, 403, { error: 'Invalid request origin.' });
    return false;
  }
}

function extractDiscordId(value) {
  const match = String(value || '').match(/\b\d{17,20}\b/);
  return match ? match[0] : null;
}

function normalizeAnswers(input) {
  let entries;
  if (Array.isArray(input)) {
    entries = input.map(item => ({
      key: String(item?.key || item?.id || item?.name || '').trim(),
      answer: String(item?.answer ?? item?.value ?? '').trim()
    }));
  } else if (input && typeof input === 'object') {
    entries = Object.entries(input).map(([key, value]) => ({ key, answer: String(value ?? '').trim() }));
  } else {
    return null;
  }
  const expectedKeys = Object.keys(QUESTION_LABELS);
  if (entries.length !== expectedKeys.length) return null;
  const map = new Map(entries.map(item => [item.key, item.answer]));
  if (expectedKeys.some(key => !map.has(key) || !map.get(key))) return null;
  if (entries.some(item => !expectedKeys.includes(item.key) || item.answer.length > 8000)) return null;
  return expectedKeys.map(key => ({ key, question: QUESTION_LABELS[key], answer: map.get(key) }));
}

function discordRequest(endpoint, options = {}) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('Missing DISCORD_BOT_TOKEN environment variable.');
  return fetch(`https://discord.com/api/v10${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  }).then(async response => {
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    if (!response.ok) {
      const error = new Error(data?.message || `Discord API returned ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return data;
  });
}

module.exports = {
  Application,
  QUESTION_LABELS,
  connectDb,
  json,
  methodNotAllowed,
  sameOriginIfProvided,
  createAccessToken,
  setAccessCookie,
  clearAccessCookie,
  requireAccess,
  extractDiscordId,
  normalizeAnswers,
  discordRequest
};
