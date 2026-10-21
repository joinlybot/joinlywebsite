const crypto = require("crypto");

const COOKIE = "joinly_admin_session";
const SITE_URL = "https://joinly-bot.xyz";
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

  if (!expires || !signature || !/^\d+$/.test(expires)) {
    return false;
  }

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
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatMessage(message) {
  return message
    .split(/\n\s*\n/)
    .map((paragraph) => {
      const text = escapeHTML(paragraph).replace(/\n/g, "<br>");
      return `<p style="line-height:1.7;margin:0 0 16px">${text}</p>`;
    })
    .join("");
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  // Protect the endpoint against cross-site requests.
  if (req.headers.origin !== SITE_URL) {
    return res.status(403).json({ error: "Request not allowed." });
  }

  if (!isValidSession(req)) {
    return res.status(401).json({
      error: "Your admin session has expired. Please log in again."
    });
  }

  const { subject, message } = req.body || {};

  if (
    typeof subject !== "string" ||
    typeof message !== "string"
  ) {
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
    // Get confirmed subscribers who have not unsubscribed.
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

    // Give every recipient an individual unsubscribe token.
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

        return {
          from: fromEmail,
          to: [subscriber.email],
          subject: cleanSubject,
          html: `
            <!DOCTYPE html>
            <html lang="en">
            <body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px">
              <div style="font-size:16px;line-height:1.7">
                ${formatMessage(cleanMessage)}
              </div>
              <hr style="border:0;border-top:1px solid #ddd;margin:28px 0 16px">
              <p style="font-size:12px;color:#666;line-height:1.6">
                You are receiving this email because you subscribed to Joinly.
                <a href="${SITE_URL}/api/unsubscribe?token=${token}">
                  Unsubscribe
                </a>
              </p>
            </body>
            </html>
          `
        };
      })
    );

    // Resend's batch endpoint accepts up to 100 emails per request.
    const sendResponse = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(recipients)
    });

    const sendResult = await sendResponse.json().catch(() => ({}));

    if (!sendResponse.ok) {
      console.error("Resend batch request failed:", sendResponse.status);

      return res.status(502).json({
        error:
          "Resend could not accept the newsletter. Check your Resend account and try again."
      });
    }

    return res.status(200).json({
      message: `Newsletter submitted to Resend for ${recipients.length} subscriber(s).`,
      sent: recipients.length
    });
  } catch (error) {
    console.error("Newsletter send error:", error.message);

    return res.status(500).json({
      error: error.message || "Something went wrong while sending the newsletter."
    });
  }
};
