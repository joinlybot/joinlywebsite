const mongoose = require('mongoose');
const {
  Application, connectDb, json, methodNotAllowed,
  sameOriginIfProvided, requireAccess, discordRequest
} = require('../../../lib/application-utils');

const GUILD_ID = '1528786692050518111';
const STAFF_ROLE_ID = '1530905170639192125';

async function sendApplicantDM(discordId, content) {
  const channel = await discordRequest('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: discordId })
  });
  await discordRequest(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content })
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!sameOriginIfProvided(req, res)) return;
  if (!requireAccess(req, res)) return;

  const id = String(req.query?.id || '');
  const decision = String(req.body?.decision || '').toLowerCase();
  if (!['approve', 'deny'].includes(decision)) {
    return json(res, 400, { error: 'Decision must be approve or deny.' });
  }
  if (!mongoose.isValidObjectId(id)) return json(res, 400, { error: 'Invalid application ID.' });

  try {
    await connectDb();
    const application = await Application.findOne({ _id: id, status: 'pending' });
    if (!application) return json(res, 404, { error: 'Application not found or already processed.' });

    if (decision === 'approve') {
      // PUT is idempotent, so retrying after a DM failure will not duplicate the role.
      await discordRequest(`/guilds/${GUILD_ID}/members/${application.discordId}/roles/${STAFF_ROLE_ID}`, {
        method: 'PUT',
        body: JSON.stringify({})
      });
      await sendApplicantDM(application.discordId, [
        '🎉 **Your Joinly staff application has been accepted!**',
        '',
        "Congratulations! You've been accepted onto the Joinly staff team.",
        'Please check the Joinly support server for next steps.'
      ].join('\n'));
    } else {
      await sendApplicantDM(application.discordId, [
        'Thank you for applying to the Joinly staff team.',
        '',
        'Unfortunately, your application has not been accepted this time.',
        'We appreciate your interest in helping Joinly and encourage you to apply again in the future.'
      ].join('\n'));
    }

    await Application.deleteOne({ _id: application._id });
    return json(res, 200, {
      success: true,
      decision,
      message: decision === 'approve'
        ? 'Applicant approved, role granted and DM sent.'
        : 'Applicant notified and application removed.'
    });
  } catch (error) {
    console.error(`[Applications] ${decision} failed:`, error);
    return json(res, 500, {
      error: error.status === 403
        ? 'The bot lacks permission to process this application. Check its role permissions and role hierarchy.'
        : 'Could not complete the decision. The application has been kept so you can retry.'
    });
  }
};
