
const NOTIFY_USER_ID = "1468027747866513479";

const QUESTIONS = [
  ["What's your Discord username & ID?", "discord"],
  ["How old are you?", "age"],
  ["How long have you been using Joinly?", "joinly-time"],
  ["Why do you want to be staff?", "why-staff"],
  ["Do you have experience moderating a Discord server?", "experience"],
  ["What skills or qualities would make you a good staff member?", "strengths"],
  ["How much time can you dedicate to Joinly each week?", "availability"],
  ["Is there anything else you'd like us to know?", "additional"],
  [
    "Scenario 1: A user publicly claims Joinly is broken, insults staff, and other members join in. What would you do?",
    "scenario-one"
  ],
  [
    "Scenario 2: A friend asks you to ignore a rule violation because you know them well. How would you handle it?",
    "scenario-two"
  ],
  [
    "Scenario 3: You receive several reports at once, including one that may involve a serious safety concern. How would you prioritise them?",
    "scenario-three"
  ]
];

function sendJson(res, status, body) {
  return res.status(status).json(body);
}

function clean(value) {
  return String(value ?? "").trim().replace(/\r\n/g, "\n");
}

function splitText(value, limit = 1000) {
  const chunks = [];
  let remaining = value || "—";

  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);

    if (cut < limit * 0.5) cut = remaining.lastIndexOf(" ", limit);
    if (cut < limit * 0.5) cut = limit;

    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function buildEmbeds(answers) {
  const fields = [];

  for (const [label, value] of answers) {
    const chunks = splitText(value);

    chunks.forEach((chunk, index) => {
      fields.push({
        name: chunks.length > 1
          ? `${label} (${index + 1}/${chunks.length})`.slice(0, 256)
          : label.slice(0, 256),
        value: chunk || "—",
        inline: false
      });
    });
  }

  const embeds = [];
  let currentFields = [];
  let currentLength = 0;

  for (const field of fields) {
    const length = field.name.length + field.value.length;

    if (
      currentFields.length >= 25 ||
      currentLength + length > 5500
    ) {
      embeds.push({
        color: 0x9a9da5,
        title: embeds.length === 0
          ? "Joinly Staff Application"
          : "Joinly Staff Application (continued)",
        fields: currentFields,
        footer: { text: "Joinly • Staff Applications" }
      });

      currentFields = [];
      currentLength = 0;
    }

    currentFields.push(field);
    currentLength += length;
  }

  if (currentFields.length) {
    embeds.push({
      color: 0x9a9da5,
      title: embeds.length === 0
        ? "Joinly Staff Application"
        : "Joinly Staff Application (continued)",
      fields: currentFields,
      footer: {
        text: `Joinly • Staff Applications • Part ${embeds.length + 1}`
      }
    });
  }

  return embeds;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const token = process.env.DISCORD_TOKEN;
  const channelId = process.env.APPLICATIONS_CHANNEL_ID;

  if (!token || !channelId) {
    console.error("Missing application environment variables.");

    return sendJson(res, 500, {
      error: "The application system is not configured correctly."
    });
  }

  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendJson(res, 400, { error: "Invalid application data." });
  }

  if (body.website) {
    return sendJson(res, 200, { success: true });
  }

  const answers = [];

  for (const [label, id] of QUESTIONS) {
    const value = clean(body[id]);

    if (!value) {
      return sendJson(res, 400, {
        error: `Please complete the required question: ${label}`
      });
    }

    if (value.length > 2500) {
      return sendJson(res, 400, {
        error: `Your answer to "${label}" is too long.`
      });
    }

    answers.push([label, value]);
  }

  const age = Number(body.age);

  if (!Number.isInteger(age) || age < 15 || age > 99) {
    return sendJson(res, 400, {
      error: "Applicants must be at least 15 years old."
    });
  }

  answers[1][1] = String(age);

  // Extract the numeric Discord user ID from the applicant's answer.
  const applicantId = answers[0][1].match(/\b\d{17,20}\b/)?.[0];

  if (!applicantId) {
    return sendJson(res, 400, {
      error: "Please include your numeric Discord user ID in the first answer so the team can process your application."
    });
  }

  const embeds = buildEmbeds(answers);

  // Buttons are attached to the first message only.
  const components = [{
    type: 1,
    components: [
      {
        type: 2,
        style: 3,
        label: "Accept",
        custom_id: `app_accept:${applicantId}`
      },
      {
        type: 2,
        style: 4,
        label: "Deny",
        custom_id: `app_deny:${applicantId}`
      }
    ]
  }];

  try {
    for (let i = 0; i < embeds.length; i += 10) {
      const payload = {
        embeds: embeds.slice(i, i + 10),
        allowed_mentions: {
          parse: [],
          users: []
        }
      };

      if (i === 0) {
        payload.content =
          `<@${NOTIFY_USER_ID}> A new Joinly staff application has been submitted.`;

        payload.allowed_mentions.users = [NOTIFY_USER_ID];
        payload.components = components;
      } else {
        payload.content =
          `Continued staff application • Part ${Math.floor(i / 10) + 1}`;
      }

      const response = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const details = await response.text().catch(() => "");

        console.error("Discord application delivery failed:", {
          status: response.status,
          part: Math.floor(i / 10) + 1,
          details: details.slice(0, 1500)
        });

        return sendJson(res, 502, {
          error: "Discord couldn't accept the application. Some application messages may already have been delivered."
        });
      }
    }

    return sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("Application submission error:", error);

    return sendJson(res, 500, {
      error: "An unexpected error occurred while submitting your application."
    });
  }
};
