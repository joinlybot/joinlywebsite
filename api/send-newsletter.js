
const crypto = require("crypto");

const COOKIE = "joinly_admin_session";
const SITE_URL = "https://joinly-bot.xyz";
const DASHBOARD_URL = "https://dashboard.joinly-bot.xyz/";
const DISCORD_URL = "https://discord.gg/PTrU8DQacj";
const MAX_RECIPIENTS = 100;

function isValidSession(req) {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) return false;

  const cookies = (req.headers.cookie || "")
    .split(";")
    .reduce((out, part) => {
      const i = part.indexOf("=");
      if (i > -1) {
        out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
      }
      return out;
    }, {});

  const token = cookies[COOKIE];
  if (!token) return false;

  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  if (Number(expires) < Date.now()) return false;

  const expected = crypto
    .createHmac("sha256", password)
    .update(`${username}:${expires}`)
    .digest("hex");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function renderText(text) {
  const escaped = escapeHTML(text);

  // Turn ordinary HTTPS/HTTP URLs into clickable links.
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => {
      const cleanUrl = url.replace(/&amp;/g, "&");
      const safeUrl = escapeHTML(cleanUrl);

      return `<a href="${safeUrl}" style="color:#b9b9ff;text-decoration:underline;word-break:break-word">${url}</a>`;
    }
  ).replace(/\n/g, "<br>");
}

function renderContent(message) {
  const lines = message.replace(/\r/g, "").split("\n");
  const blocks = [];
  let currentHeading = "";
  let currentParagraphs = [];

  function flush() {
    if (!currentHeading && currentParagraphs.length === 0) return;

    const content = currentParagraphs
      .map((paragraph) => `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.8;color:#d4d4dc">
          ${renderText(paragraph)}
        </p>
      `)
      .join("");

    if (currentHeading) {
      blocks.push(`
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
          style="border-collapse:separate;border-spacing:0;background:#202027;border:1px solid #34343e;border-radius:12px;margin:0 0 18px">
          <tr>
            <td style="padding:22px">
              <h2 style="margin:0 0 14px;font-size:19px;line-height:1.4;color:#ffffff;font-weight:700">
                ${escapeHTML(currentHeading)}
              </h2>
              ${content}
            </td>
          </tr>
        </table>
      `);
    } else {
      blocks.push(content);
    }

    currentHeading = "";
    currentParagraphs = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith("## ")) {
      flush();
      currentHeading = line.slice(3).trim();
    } else if (!line) {
      if (currentParagraphs.length) {
        currentParagraphs.push("");
      }
    } else {
      if (
        currentParagraphs.length &&
        currentParagraphs[currentParagraphs.length - 1] !== ""
      ) {
        currentParagraphs[currentParagraphs.length - 1] += "\n" + line;
      } else {
        currentParagraphs.push(line);
      }
    }
  }

  flush();

  return blocks.join("");
}

function makeEmailHTML(subject, message, unsubscribeURL) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHTML(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#111116;font-family:Arial,Helvetica,sans-serif;color:#eeeeF4">

  <div style="display:none;font-size:1px;color:#111116;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">
    The latest from Joinly.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
    style="background:#111116;border-collapse:collapse">
    <tr>
      <td align="center" style="padding:28px 12px">

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
          style="max-width:600px;width:100%;border-collapse:collapse">

          <!-- Brand header -->
          <tr>
            <td style="padding:10px 8px 24px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left">
                    <a href="${SITE_URL}/" style="font-size:28px;font-weight:800;letter-spacing:-1.2px;color:#ffffff;text-decoration:none">
                      Joinly
                    </a>
                  </td>
                  <td align="right" style="font-size:11px;letter-spacing:1.5px;color:#9696a5">
                    Joinly Newsletter
                  </td>
                </tr>
              </table>
              <div style="height:1px;background:#34343e;margin-top:22px"></div>
            </td>
          </tr>

          <!-- Newsletter subject -->
          <tr>
            <td style="padding:14px 8px 22px">
              <div style="font-size:11px;letter-spacing:2px;color:#aaaaff;font-weight:700;margin-bottom:14px">
                THE LATEST FROM JOINLY
              </div>
              <h1 style="font-size:30px;line-height:1.25;letter-spacing:-0.7px;color:#ffffff;margin:0;font-weight:750;overflow-wrap:anywhere">
                ${escapeHTML(subject)}
              </h1>
            </td>
          </tr>

          <!-- Newsletter content -->
          <tr>
            <td style="padding:0 8px 16px">
              ${renderContent(message)}
            </td>
          </tr>

          <!-- Explore Joinly -->
          <tr>
            <td style="padding:8px 8px 32px">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" bgcolor="#eeeeff" style="border-radius:8px">
                    <a href="${DASHBOARD_URL}"
                      style="display:inline-block;padding:14px 22px;color:#171721;font-size:14px;font-weight:700;text-decoration:none">
                      Explore Joinly &#8594;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #34343e;padding:26px 8px 12px">

              <div style="font-size:21px;font-weight:800;letter-spacing:-0.7px;color:#ffffff;margin-bottom:10px">
                Joinly
              </div>

              <p style="margin:0 0 20px;color:#a5a5b3;font-size:13px;line-height:1.7">
                Stay connected with Joinly. Visit the website, explore your dashboard, or join our community.
              </p>

              <!-- Text-based icon-style links for email compatibility -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0"
                style="margin:0 0 22px">
                <tr>
                  <td style="padding:0 8px 8px 0">
                    <a href="${DISCORD_URL}"
                      style="display:inline-block;border:1px solid #42424f;border-radius:7px;padding:9px 11px;color:#eeeeF4;text-decoration:none;font-size:12px;font-weight:700">
                      &#9679; Discord
                    </a>
                  </td>
                  <td style="padding:0 8px 8px 0">
                    <a href="${SITE_URL}/"
                      style="display:inline-block;border:1px solid #42424f;border-radius:7px;padding:9px 11px;color:#eeeeF4;text-decoration:none;font-size:12px;font-weight:700">
                      &#9679; Website
                    </a>
                  </td>
                  <td style="padding:0 0 8px">
                    <a href="${DASHBOARD_URL}"
                      style="display:inline-block;border:1px solid #42424f;border-radius:7px;padding:9px 11px;color:#eeeeF4;text-decoration:none;font-size:12px;font-weight:700">
                      &#9679; Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 12px;color:#858592;font-size:11px;line-height:1.7">
                You're receiving this email because you subscribed to Joinly.
              </p>

              <p style="margin:0 0 12px;font-size:11px;line-height:1.7">
                <a href="${unsubscribeURL}" style="color:#b9b9ff;text-decoration:underline">
                  Unsubscribe from these emails
                </a>
                &nbsp; | &nbsp;
                <a href="${SITE_URL}/" style="color:#b9b9ff;text-decoration:underline">
                  Visit Joinly
                </a>
              </p>

              <p style="margin:0;color:#70707d;font-size:11px;line-height:1.7">
                &copy; ${new Date().getFullYear()} Joinly. All rights reserved.
              </p>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (req.headers.origin !== SITE_URL) {
    return res.status(403).json({ error: "Request not allowed." });
  }

  if (!isValidSession(req)) {
    return res.status(401).json({
      error: "Your admin session has expired. Please log in again."
    });
  }

  const { subject, message } = req.body || {};

  if (typeof subject !== "string" || typeof message !== "string") {
    return res.status(400).json({
      error: "Please provide a subject and message."
    });
  }

  const cleanSubject = subject.trim();
  const cleanMessage = message.trim();

  if (
    !cleanSubject ||
    cleanSubject.length > 180 ||
    /[\r\n]/.test(cleanSubject)
  ) {
    return res.status(400).json({
      error: "Enter a valid subject of up to 180 characters."
    });
  }

  if (!cleanMessage || cleanMessage.length > 10000) {
    return res.status(400).json({
      error: "Your message must be between 1 and 10,000 characters."
    });
  }

  const supabaseURL = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.NEWSLETTER_FROM_EMAIL;

  if (!supabaseURL || !supabaseKey || !resendKey || !fromEmail) {
    return res.status(500).json({
      error: "A required server environment variable is missing."
    });
  }

  const supabaseHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json"
  };

  try {
    const subscriberURL = new URL(
      "/rest/v1/newsletter_subscribers",
      supabaseURL
    );

    subscriberURL.searchParams.set("select", "id,email");
    subscriberURL.searchParams.set("confirmed", "eq.true");
    subscriberURL.searchParams.set("unsubscribed_at", "is.null");
    subscriberURL.searchParams.set("order", "id.asc");

    const subscriberResponse = await fetch(subscriberURL, {
      headers: {
        ...supabaseHeaders,
        Range: `0-${MAX_RECIPIENTS}`
      }
    });

    if (!subscriberResponse.ok) {
      throw new Error("Could not retrieve subscribers from the database.");
    }

    const subscribers = await subscriberResponse.json();

    if (!Array.isArray(subscribers)) {
      throw new Error("Unexpected subscriber database response.");
    }

    if (subscribers.length === 0) {
      return res.status(200).json({
        message: "There are no confirmed, active subscribers to email.",
        sent: 0
      });
    }

    if (subscribers.length > MAX_RECIPIENTS) {
      return res.status(400).json({
        error:
          "There are more than 100 active subscribers. This version supports up to 100 per send."
      });
    }

    const recipients = await Promise.all(
      subscribers.map(async (subscriber) => {
        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = sha256(token);

        const updateURL = new URL(
          "/rest/v1/newsletter_subscribers",
          supabaseURL
        );

        updateURL.searchParams.set("id", `eq.${subscriber.id}`);
        updateURL.searchParams.set("confirmed", "eq.true");
        updateURL.searchParams.set("unsubscribed_at", "is.null");

        const updateResponse = await fetch(updateURL, {
          method: "PATCH",
          headers: {
            ...supabaseHeaders,
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            unsubscribe_token_hash: tokenHash
          })
        });

        if (!updateResponse.ok) {
          throw new Error("Could not prepare unsubscribe links.");
        }

        const updatedRows = await updateResponse.json();

        if (!Array.isArray(updatedRows) || updatedRows.length !== 1) {
          throw new Error(
            "A subscriber changed status. Please try sending again."
          );
        }

        const unsubscribeURL =
          `${SITE_URL}/api/unsubscribe?token=${token}`;

        return {
          from: `Joinly Newsletter <${fromEmail}>`,
          to: [subscriber.email],
          subject: cleanSubject,
          html: makeEmailHTML(
            cleanSubject,
            cleanMessage,
            unsubscribeURL
          )
        };
      })
    );

    const sendResponse = await fetch(
      "https://api.resend.com/emails/batch",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(recipients)
      }
    );

    if (!sendResponse.ok) {
      console.error("Resend batch request failed:", sendResponse.status);

      return res.status(502).json({
        error:
          "Resend could not accept the newsletter. Check your Resend account and try again."
      });
    }

    return res.status(200).json({
      message:
        `Newsletter submitted to Resend for ${recipients.length} subscriber(s).`,
      sent: recipients.length
    });
  } catch (error) {
    console.error("Newsletter send error:", error.message);

    return res.status(500).json({
      error:
        error.message ||
        "Something went wrong while sending the newsletter."
    });
  }
};
