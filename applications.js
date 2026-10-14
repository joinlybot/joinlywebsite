const {
  Application, connectDb, json, methodNotAllowed,
  sameOriginIfProvided, extractDiscordId, normalizeAnswers
} = require('../lib/application-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!sameOriginIfProvided(req, res)) return;

  try {
    await connectDb();

    // Honeypot: silently accept bot submissions without storing them.
    if (String(req.body?.website || '').trim()) {
      return json(res, 200, { success: true, message: 'Application submitted.' });
    }

    const answers = normalizeAnswers(req.body?.answers);
    if (!answers) {
      return json(res, 400, { error: 'Please complete all required questions with valid answers.' });
    }

    const age = Number(answers.find(answer => answer.key === 'age')?.answer);
    if (!Number.isInteger(age) || age < 15 || age > 100) {
      return json(res, 400, { error: 'You must be at least 15 years old to apply.' });
    }

    const discordAnswer = answers.find(answer => answer.key === 'discord')?.answer || '';
    const discordId = extractDiscordId(discordAnswer);
    if (!discordId) {
      return json(res, 400, { error: 'Please include your Discord user ID (17–20 digits).' });
    }

    const existing = await Application.findOne({ discordId, status: 'pending' }).lean();
    if (existing) return json(res, 409, { error: 'You already have a pending application.' });

    const discordUsername = discordAnswer.replace(discordId, '').trim() || discordId;
    await Application.create({ discordUsername, discordId, answers, status: 'pending' });

    return json(res, 201, { success: true, message: 'Your application has been submitted.' });
  } catch (error) {
    console.error('[Applications] Submission failed:', error);
    return json(res, 500, { error: 'Could not submit your application. Please try again.' });
  }
};
