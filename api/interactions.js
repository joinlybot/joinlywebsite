const crypto = require('node:crypto');
const { waitUntil } = require('@vercel/functions');

const DISCORD_API = 'https://discord.com/api/v10';

const DEFAULT_GUILD_ID = '1528786692050518111';
const DEFAULT_STAFF_ROLE_ID = '1528798387686609080';
const DEFAULT_WELCOME_CHANNEL_ID = '1528800562244489297';

const DEFAULT_REVIEWER_ROLES = [
  '1528798387686609080',
  '1528798461468606604'
];

module.exports.config = {
  api: {
    bodyParser: false
  }
};

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function verifySignature(publicKeyHex, signatureHex, timestamp, body) {
  if (
    !/^[0-9a-f]{64}$/i.test(publicKeyHex || '') ||
    !/^[0-9a-f]{128}$/i.test(signatureHex || '') ||
    !timestamp
  ) {
    return false;
  }

  try {
    const prefix = Buffer.from('302a300506032b6570032100', 'hex');

    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([
        prefix,
        Buffer.from(publicKeyHex, 'hex')
      ]),
      format: 'der',
      type: 'spki'
    });

    return crypto.verify(
      null,
      Buffer.concat([Buffer.from(timestamp), body]),
      publicKey,
      Buffer.from(signatureHex, 'hex')
    );
  } catch (error) {
    console.error(
      '[Joinly Interactions] Signature verification failed:',
      error
    );

    return false;
  }
}

async function botRequest(endpoint, options = {}) {
  const token = process.env.DISCORD_TOKEN;

  if (!token) {
    throw new Error('DISCORD_TOKEN is not configured.');
  }

  const response = await fetch(`${DISCORD_API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const raw = await response.text();

  let data = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!response.ok) {
    const error = new Error(
      data?.message || `Discord API returned ${response.status}.`
    );

    error.status = response.status;
    throw error;
  }

  return data;
}

async function editInteractionReply(interaction, content) {
  const response = await fetch(
    `${DISCORD_API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content,
        allowed_mentions: {
          parse: []
        }
      })
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');

    console.error(
      '[Joinly Interactions] Could not update interaction response:',
      response.status,
      detail
    );
  }
}

async function disableReviewButtons(interaction) {
  const message = interaction.message;

  if (!message?.id || !interaction.channel_id) {
    return;
  }

  const components = (message.components || []).map(row => ({
    type: 1,
    components: (row.components || []).map(button => {
      if (button.type !== 2 || !button.custom_id) {
        return button;
      }

      return {
        type: 2,
        style: button.style,
        label: button.label,
        custom_id: button.custom_id,
        disabled: true,
        ...(button.emoji ? { emoji: button.emoji } : {}),
        ...(button.disabled ? { disabled: true } : {})
      };
    })
  }));

  if (!components.length) return;

  await botRequest(
    `/channels/${interaction.channel_id}/messages/${message.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ components })
    }
  );
}

async function sendDm(userId, content) {
  const channel = await botRequest('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({
      recipient_id: userId
    })
  });

  await botRequest(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      allowed_mentions: {
        parse: []
      }
    })
  });
}

function getReviewerRoles() {
  return String(
    process.env.APPLICATION_REVIEWER_ROLE_IDS ||
    DEFAULT_REVIEWER_ROLES.join(',')
  )
    .split(',')
    .map(role => role.trim())
    .filter(Boolean);
}

async function processDecision(
  interaction,
  decision,
  applicantId,
  guildId,
  staffRoleId,
  welcomeChannelId
) {
  try {
    // Confirm Discord recognises the applicant ID.
    await botRequest(`/users/${applicantId}`);

    if (decision === 'accept') {
      // Grant the staff role.
      await botRequest(
        `/guilds/${guildId}/members/${applicantId}/roles/${staffRoleId}`,
        {
          method: 'PUT'
        }
      );

      // Notify the applicant.
      await sendDm(
        applicantId,
        '🎉 Congratulations! Your application to join the Joinly team has been accepted. Welcome aboard!'
      );

      // Post the welcome message.
      await botRequest(
        `/channels/${welcomeChannelId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: `<@${applicantId}> Welcome!

Please wait for <@1468027747866513479> to walk you through the support guide.`,
            allowed_mentions: {
              parse: [],
              users: [applicantId]
            }
          })
        }
      );

      await disableReviewButtons(interaction);

      await editInteractionReply(
        interaction,
        `✅ Application accepted for <@${applicantId}>. The staff role was granted, the acceptance DM was sent, and the welcome message was posted.`
      );

      return;
    }

    // Notify the applicant of the decision.
    await sendDm(
      applicantId,
      "Thank you for applying to join the Joinly team. Unfortunately, we've decided not to move forward with your application at this time. We appreciate your interest and encourage you to apply again in the future."
    );

    await disableReviewButtons(interaction);

    await editInteractionReply(
      interaction,
      `Application denied for <@${applicantId}>. The applicant was sent a DM.`
    );
  } catch (error) {
    console.error(
      `[Joinly Interactions] ${decision} failed for ${applicantId}:`,
      error?.status || '',
      error?.message || error
    );

    let message =
      'The action could not be completed. Check the bot configuration and try again.';

    if (error.status === 404) {
      message =
        'Discord could not find that user or server member. Check the ID and make sure the applicant is in the support server.';
    } else if (error.status === 403) {
      message =
        "Discord rejected the action. Check the bot's permissions, role hierarchy, and whether the applicant allows DMs.";
    } else if (error.status === 429) {
      message =
        'Discord is rate-limiting the bot. Please wait a moment before trying again.';
    }

    await editInteractionReply(
      interaction,
      `⚠️ ${message} Check the Vercel Runtime Logs for details.`
    );
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method not allowed');
  }

  let rawBody;

  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    console.error(
      '[Joinly Interactions] Could not read request body:',
      error
    );

    return res.status(400).end('Invalid request body');
  }

  const publicKey = process.env.DISCORD_PUBLIC_KEY || '';
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  if (
    !verifySignature(
      publicKey,
      String(signature || ''),
      String(timestamp || ''),
      rawBody
    )
  ) {
    return res.status(401).end('Invalid request signature');
  }

  let interaction;

  try {
    interaction = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).end('Invalid JSON');
  }

  // Discord endpoint verification.
  if (interaction.type === 1) {
    return sendJson(res, 200, { type: 1 });
  }

  // Handle button interactions only.
  if (interaction.type !== 3) {
    return sendJson(res, 200, {
      type: 4,
      data: {
        content: 'Unsupported interaction.',
        flags: 64
      }
    });
  }

  const customId = String(interaction.data?.custom_id || '');
  const match = customId.match(/^app_(accept|deny):(\d{17,20})$/);

  if (!match) {
    return sendJson(res, 200, {
      type: 4,
      data: {
        content: 'This application button is invalid.',
        flags: 64
      }
    });
  }

  const guildId = String(
    process.env.APPLICATION_GUILD_ID || DEFAULT_GUILD_ID
  );

  const staffRoleId = String(
    process.env.APPLICATION_STAFF_ROLE_ID || DEFAULT_STAFF_ROLE_ID
  );

  const welcomeChannelId = String(
    process.env.APPLICATION_WELCOME_CHANNEL_ID ||
    DEFAULT_WELCOME_CHANNEL_ID
  );

  const reviewerRoles = getReviewerRoles();

  const memberRoles = Array.isArray(interaction.member?.roles)
    ? interaction.member.roles.map(String)
    : [];

  if (
    String(interaction.guild_id || '') !== guildId ||
    !reviewerRoles.some(role => memberRoles.includes(role))
  ) {
    return sendJson(res, 200, {
      type: 4,
      data: {
        content: 'You do not have permission to review applications.',
        flags: 64
      }
    });
  }

  const decision = match[1];
  const applicantId = match[2];

  // Acknowledge the interaction within Discord's 3-second deadline.
  // Register the decision work with Vercel so it can continue afterwards.
  try {
    waitUntil(
      processDecision(
        interaction,
        decision,
        applicantId,
        guildId,
        staffRoleId,
        welcomeChannelId
      )
    );
  } catch (error) {
    console.error(
      '[Joinly Interactions] Could not schedule decision:',
      error
    );

    return sendJson(res, 200, {
      type: 4,
      data: {
        content: 'Could not start the review action. Please try again.',
        flags: 64
      }
    });
  }

  return sendJson(res, 200, {
    type: 5,
    data: {
      flags: 64
    }
  });
};
