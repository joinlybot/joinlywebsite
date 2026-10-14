
const crypto = require("node:crypto");

const API = "https://discord.com/api/v10";

const GUILD_ID =
  process.env.APPLICATION_GUILD_ID || "1528786692050518111";

const STAFF_ROLE_IDS = (
  process.env.APPLICATION_REVIEWER_ROLE_IDS ||
  "1528798387686606604,1535304887946977341,1528798542578057366,1530905170639192125"
)
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

const ACCEPTED_ROLE_ID = "1530905170639192125";
const WELCOME_CHANNEL_ID = "1528800562244489297";

function discordKey(publicKeyHex) {
  return crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(publicKeyHex, "hex")
    ]),
    format: "der",
    type: "spki"
  });
}

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function verifyRequest(rawBody, signature, timestamp, publicKey) {
  if (
    typeof signature !== "string" ||
    !/^[a-f0-9]{128}$/i.test(signature) ||
    typeof timestamp !== "string" ||
    !/^\d+$/.test(timestamp)
  ) {
    return false;
  }

  // Reject stale requests to reduce replay risk.
  const requestTime = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isSafeInteger(requestTime) || Math.abs(now - requestTime) > 300) {
    return false;
  }

  try {
    return crypto.verify(
      null,
      Buffer.concat([Buffer.from(timestamp), rawBody]),
      discordKey(publicKey),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

async function discordRequest(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const error = new Error(
      data.message || `Discord returned HTTP ${response.status}.`
    );

    error.status = response.status;
    throw error;
  }

  return data;
}

async function followUp(interaction, content) {
  try {
    await fetch(
      `${API}/webhooks/${interaction.application_id}/${interaction.token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          flags: 64,
          allowed_mentions: { parse: [] }
        })
      }
    );
  } catch (error) {
    console.error("Could not send interaction follow-up:", error);
  }
}

async function disableButtons(interaction, userId) {
  const components = [{
    type: 1,
    components: [
      {
        type: 2,
        style: 3,
        label: "Accept",
        custom_id: `app_accept:${userId}`,
        disabled: true
      },
      {
        type: 2,
        style: 4,
        label: "Deny",
        custom_id: `app_deny:${userId}`,
        disabled: true
      }
    ]
  }];

  await fetch(
    `${API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ components })
    }
  );
}

async function sendDM(userId, content) {
  const channel = await discordRequest("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: userId })
  });

  await discordRequest(`/channels/${channel.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content,
      allowed_mentions: { parse: [] }
    })
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!publicKey || !process.env.DISCORD_TOKEN) {
    console.error("Missing DISCORD_PUBLIC_KEY or DISCORD_TOKEN.");
    return res.status(500).end();
  }

  let rawBody;

  try {
    rawBody = await readRawBody(req);
  } catch {
    return res.status(400).end();
  }

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  if (!verifyRequest(rawBody, signature, timestamp, publicKey)) {
    return res.status(401).end();
  }

  let interaction;

  try {
    interaction = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).end();
  }

  // Discord endpoint verification ping.
  if (interaction.type === 1) {
    return res.status(200).json({ type: 1 });
  }

  if (interaction.type !== 3) {
    return res.status(400).end();
  }

  const customId = interaction.data?.custom_id || "";
  const match = customId.match(/^app_(accept|deny):(\d{17,20})$/);

  if (!match) {
    return res.status(200).json({
      type: 4,
      data: {
        content: "This application button is invalid.",
        flags: 64
      }
    });
  }

  const [, action, applicantId] = match;
  const reviewerRoles = interaction.member?.roles || [];
  const reviewerId = interaction.member?.user?.id;

  if (
    interaction.guild_id !== GUILD_ID ||
    !reviewerId ||
    !reviewerRoles.some(role => STAFF_ROLE_IDS.includes(role))
  ) {
    return res.status(200).json({
      type: 4,
      data: {
        content: "You don't have permission to review staff applications.",
        flags: 64
      }
    });
  }

  // Acknowledge the click immediately; finish the work afterward.
  res.status(200).json({ type: 6 });

  try {
    if (action === "accept") {
      // Give the accepted applicant the staff role.
      await discordRequest(
        `/guilds/${GUILD_ID}/members/${applicantId}/roles/${ACCEPTED_ROLE_ID}`,
        { method: "PUT" }
      );

      let dmFailed = false;

      try {
        await sendDM(
          applicantId,
          "Congratulations! Your application to join the Joinly team has been accepted. Welcome aboard!"
        );
      } catch (error) {
        dmFailed = true;
        console.error("Acceptance DM failed:", error.message);
      }

      // Welcome the new staff member in the designated channel.
      await discordRequest(
        `/channels/${WELCOME_CHANNEL_ID}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: `<@${applicantId}> Welcome!`,
            allowed_mentions: { users: [applicantId] }
          })
        }
      );

      await disableButtons(interaction, applicantId);

      await followUp(
        interaction,
        dmFailed
          ? "Application accepted and role assigned, but I couldn't DM the applicant. They may have DMs disabled."
          : "Application accepted, role assigned, and welcome message sent."
      );
    } else {
      let dmFailed = false;

      try {
        await sendDM(
          applicantId,
          "Thank you for applying to join the Joinly team. Unfortunately, we've decided not to move forward with your application at this time. We appreciate your interest and encourage you to apply again in the future."
        );
      } catch (error) {
        dmFailed = true;
        console.error("Rejection DM failed:", error.message);
      }

      await disableButtons(interaction, applicantId);

      await followUp(
        interaction,
        dmFailed
          ? "The application was denied, but I couldn't DM the applicant. They may have DMs disabled."
          : "Application denied and the applicant has been notified."
      );
    }
  } catch (error) {
    console.error("Application decision failed:", {
      action,
      applicantId,
      message: error.message,
      status: error.status
    });

    await followUp(
      interaction,
      "I couldn't complete this decision. Check the bot's permissions and Vercel logs before trying again."
    );
  }
};

// Discord must receive the raw request body for signature verification.
module.exports.config = {
  api: {
    bodyParser: false
  }
};
