const { json, methodNotAllowed, sameOriginIfProvided, clearAccessCookie } = require('../../lib/application-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!sameOriginIfProvided(req, res)) return;
  clearAccessCookie(res);
  return json(res, 200, { success: true });
};
