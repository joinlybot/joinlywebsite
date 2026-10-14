const crypto = require('node:crypto');
const { json, methodNotAllowed, sameOriginIfProvided, setAccessCookie } = require('../../lib/application-utils');

// Best-effort rate limit per warm serverless instance; add platform-level rate limiting for stronger protection.
const attempts = global.__joinlyApplicationUnlockAttempts || (global.__joinlyApplicationUnlockAttempts = new Map());
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!sameOriginIfProvided(req, res)) return;

  const expectedPasscode = process.env.APPLICATIONS_PASSCODE;
  if (!expectedPasscode) return json(res, 500, { error: 'Application passcode is not configured.' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  let entry = attempts.get(ip);
  if (!entry || now - entry.startedAt > WINDOW_MS) entry = { count: 0, startedAt: now };
  if (entry.count >= MAX_ATTEMPTS) {
    attempts.set(ip, entry);
    return json(res, 429, { error: 'Too many attempts. Please try again later.' });
  }
  entry.count += 1;
  attempts.set(ip, entry);

  const actual = Buffer.from(String(req.body?.passcode || ''));
  const expected = Buffer.from(expectedPasscode);
  const valid = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  if (!valid) return json(res, 401, { error: 'Incorrect passcode.' });

  attempts.delete(ip);
  try {
    setAccessCookie(res);
    return json(res, 200, { success: true });
  } catch (error) {
    console.error('[Applications] Unlock failed:', error);
    return json(res, 500, { error: 'Could not unlock applications.' });
  }
};
