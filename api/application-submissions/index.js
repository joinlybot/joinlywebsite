const { Application, connectDb, json, methodNotAllowed, requireAccess } = require('../../lib/application-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!requireAccess(req, res)) return;

  try {
    await connectDb();
    const applications = await Application.find({ status: 'pending' }).sort({ submittedAt: -1 }).lean();
    return json(res, 200, {
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
    console.error('[Applications] Fetch failed:', error);
    return json(res, 500, { error: 'Could not load applications.' });
  }
};
