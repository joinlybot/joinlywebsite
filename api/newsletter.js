const crypto = require("crypto");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return res.status(400).json({
      error: "Please enter a valid email address."
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.NEWSLETTER_FROM_EMAIL;

  if (!supabaseUrl || !supabaseKey || !resendKey || !fromEmail) {
    console.error("Newsletter environment variables are missing.");
    return res.status(500).json({
      error: "Newsletter service is not configured."
    });
  }

  try {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    const baseUrl = supabaseUrl.replace(/\/$/, "");
    const siteUrl = "https://joinly-bot.xyz";

    const lookup = await fetch(
      `${baseUrl}/rest/v1/newsletter_subscribers?email=eq.${encodeURIComponent(email)}&select=id,confirmed,unsubscribed_at`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );

    if (!lookup.ok) {
      console.error("Subscriber lookup failed:", await lookup.text());
      return res.status(500).json({
        error: "Could not process your signup. Please try again."
      });
    }

    const existing = await lookup.json();

    if (
      existing.length &&
      existing[0].confirmed &&
      !existing[0].unsubscribed_at
    ) {
      return res.status(200).json({
        message: "You're already subscribed!"
      });
    }

    if (existing.length && existing[0].unsubscribed_at) {
      return res.status(200).json({
        message: "Please contact Joinly to resubscribe."
      });
    }

    // Create a separate token for unsubscribe links.
    const unsubscribeToken = crypto.randomBytes(32).toString("hex");
    const unsubscribeTokenHash = crypto
      .createHash("sha256")
      .update(unsubscribeToken)
      .digest("hex");

    let saveResponse;

    if (existing.length) {
      saveResponse = await fetch(
        `${baseUrl}/rest/v1/newsletter_subscribers?id=eq.${existing[0].id}`,
        {
          method: "PATCH",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            confirmation_token_hash: tokenHash,
            confirmation_expires_at: expiresAt,
            unsubscribe_token_hash: unsubscribeTokenHash,
            confirmed: false
          })
        }
      );
    } else {
      saveResponse = await fetch(
        `${baseUrl}/rest/v1/newsletter_subscribers`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            email,
            confirmed: false,
            confirmation_token_hash: tokenHash,
            confirmation_expires_at: expiresAt,
            unsubscribe_token_hash: unsubscribeTokenHash
          })
        }
      );
    }

    if (!saveResponse.ok) {
      console.error("Subscriber save failed:", await saveResponse.text());
      return res.status(500).json({
        error: "Could not save your signup. Please try again."
      });
    }

    const confirmationUrl =
      `${siteUrl}/api/confirm?token=${token}&email=${encodeURIComponent(email)}`;

    const unsubscribeUrl =
      `${siteUrl}/api/unsubscribe?token=${unsubscribeToken}`;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: `Joinly Newsletter <${fromEmail}>`,
        to: [email],
        subject: "Confirm your Joinly newsletter subscription",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;line-height:1.6;color:#222">
            <h2>Confirm your Joinly subscription</h2>
            <p>Thanks for signing up for Joinly updates.</p>
            <p>Please confirm your email address by clicking below:</p>
            <p>
              <a href="${confirmationUrl}"
                 style="display:inline-block;background:#171717;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px">
                Confirm my email
              </a>
            </p>
            <p>This link expires in 24 hours. If you didn't request this, you can ignore this email.</p>
            <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
            <p style="font-size:12px;color:#666">
              Unsubscribe link for your records:
              <a href="${unsubscribeUrl}">Unsubscribe</a>
            </p>
          </div>
        `
      })
    });

    if (!emailResponse.ok) {
      console.error("Resend error:", await emailResponse.text());
      return res.status(500).json({
        error: "Your signup was saved, but we couldn't send the confirmation email. Please try again later."
      });
    }

    return res.status(200).json({
      message: "Check your inbox for a confirmation email from Joinly. Our only official email is hello\@joinly-bot.xyz — any other address isn’t us."
    });
  } catch (error) {
    console.error("Newsletter signup failed:", error);
    return res.status(500).json({
      error: "Something went wrong. Please try again."
    });
  }
};
