const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_ID_REGEX = /^\d{17,20}$/;
const NOTIFY_USER_ID = '1468027747866513479';

const QUESTIONS = [
  ['discord-username', "What's your Discord username?"],
  ['discord-id', "What's your Discord user ID?"],
  ['age', 'How old are you?'],
  ['joinly-time', 'How long have you been using Joinly?'],
  ['why-staff', 'Why do you want to be staff?'],
  ['experience', 'Do you have experience moderating a Discord server?'],
  ['strengths', 'What skills or qualities would make you a good staff member?'],
  ['availability', 'How much time can you dedicate to Joinly each week?'],
  ['additional', "Is there anything else you'd like us to know?"],
  ['scenario-one', 'Scenario 1: A user publicly claims Joinly is broken, insults staff, and other members join in. What would you do?'],
  ['scenario-two', 'Scenario 2: A friend asks you to ignore a rule violation because you know them well. How would you handle it?'],
  ['scenario-three', 'Scenario 3: You receive several reports at once, including one that may involve a serious safety concern. How would you prioritise them?']
];

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function discordRequest(endpoint, options = {}) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN is not configured.');
  return fetch(`${DISCORD_API}${endpoint}`, {
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

function chunkAnswer(value, max = 1024) {
  const text = String(value || '').trim() || 'No answer provided.';
  const chunks = [];
  for (let i = 0; i < text.length; i += max) chunks.push(text.slice(i, i + max));
  return chunks;
}

function buildFields(answers) {
  const byKey = new Map(answers.map(item => [item.key, item.answer]));
  const fields = [];
  for (const [key, label] of QUESTIONS) {
    const chunks = chunkAnswer(byKey.get(key));
    chunks.forEach((value, index) => {
      fields.push({
        name: index === 0 ? label.slice(0, 256) : `${label} (continued)`.slice(0, 256),
        value,
        inline: false
      });
    });
  }
  return fields;
}

function buildEmbeds(answers, discordUsername, discordId) {
  const fields = buildFields(answers);
  const embeds = [];
  let current = [];
  let characters = 0;
  for (const field of fields) {
    const size = field.name.length + field.value.length;
    if (current.length >= 25 || (current.length && characters + size > 5600)) {
      embeds.push(current);
      current = [];
      characters = 0;
    }
    current.push(field);
    characters += size;
  }
  if (current.length) embeds.push(current);
  return embeds.map((embedFields, index) => ({
    title: index === 0 ? 'Joinly Staff Application' : 'Joinly Staff Application (continued)',
    color: 5793266,
    fields: embedFields,
    footer: { text: `Joinly • Staff Applications • Part ${index + 1} of ${embeds.length}` },
    timestamp: new Date().toISOString()
  }));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const origin = req.headers.origin;
  if (origin) {
    try {
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
      if (new URL(origin).host !== host) return sendJson(res, 403, { error: 'Cross-origin request blocked.' });
    } catch {
      return sendJson(res, 403, { error: 'Invalid request origin.' });
    }
  }

  try {
    if (String(req.body?.website || '').trim()) return sendJson(res, 200, { success: true });

    const rawAnswers = req.body?.answers;
    if (!Array.isArray(rawAnswers) || rawAnswers.length !== QUESTIONS.length) {
      return sendJson(res, 400, { error: 'Please complete every required application question.' });
    }

    const answerMap = new Map();
    for (const item of rawAnswers) {
      const key = String(item?.key || '').trim();
      const answer = String(item?.answer ?? item?.value ?? '').trim();
      if (!QUESTIONS.some(([expected]) => expected === key) || !answer || answer.length > 8000 || answerMap.has(key)) {
        return sendJson(res, 400, { error: 'One or more answers are missing or invalid. Please check your application.' });
      }
      answerMap.set(key, answer);
    }
    if (QUESTIONS.some(([key]) => !answerMap.has(key))) {
      return sendJson(res, 400, { error: 'Please complete every required application question.' });
    }

    const discordUsername = answerMap.get('discord-username');
    const discordId = answerMap.get('discord-id');
    if (!discordUsername || discordUsername.length > 100) {
      return sendJson(res, 400, { error: 'Please enter your Discord username.' });
    }
    if (!DISCORD_ID_REGEX.test(discordId)) {
      return sendJson(res, 400, { error: 'Your Discord user ID must contain exactly 17–20 digits, with no spaces or other characters.' });
    }

    const age = Number(answerMap.get('age'));
    if (!Number.isInteger(age) || age < 15 || age > 99) {
      return sendJson(res, 400, { error: 'Applicants must be at least 15 years old.' });
    }

    const channelId = String(process.env.APPLICATIONS_CHANNEL_ID || '').trim();
    if (!channelId) throw new Error('APPLICATIONS_CHANNEL_ID is not configured.');

    // Format validation alone cannot prove an ID exists; verify it with Discord as well.
    try {
      await discordRequest(`/users/${discordId}`);
    } catch (error) {
      if (error.status === 404) return sendJson(res, 400, { error: 'Discord could not find a user with that ID. Please double-check it.' });
      throw error;
    }

    const answers = QUESTIONS.map(([key, question]) => ({ key, question, answer: answerMap.get(key) }));
    const embeds = buildEmbeds(answers, discordUsername, discordId);
    let sent = 0;

    for (let i = 0; i < embeds.length; i++) {
      const payload = {
        embeds: [embeds[i]],
        allowed_mentions: i === 0
          ? { parse: [], users: [NOTIFY_USER_ID] }
          : { parse: [] }
      };
      if (i === 0) {
        payload.content = `<@${NOTIFY_USER_ID}> a new Joinly staff application has been submitted.`;
        payload.components = [{
          type: 1,
          components: [
            { type: 2, style: 3, label: 'Accept', custom_id: `app_accept:${discordId}` },
            { type: 2, style: 4, label: 'Deny', custom_id: `app_deny:${discordId}` }
          ]
        }];
      }
      await discordRequest(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      sent++;
    }

    return sendJson(res, 201, { success: true, message: 'Your application has been submitted.' });
  } catch (error) {
    console.error('[Joinly Applications] Submission failed:', error?.status || '', error?.message || error);
    return sendJson(res, 500, { error: 'We could not submit your application right now. Please try again later or contact the Joinly support server.' });
  }
};
