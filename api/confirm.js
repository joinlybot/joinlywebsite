const crypto = require("crypto");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed.");
  }

  const token =
    typeof req.query?.token === "string" ? req.query.token : "";

  const email =
    typeof req.query?.email === "string"
      ? req.query.email.trim().toLowerCase()
      : "";

  if (
    !/^[a-f0-9]{64}$/.test(token) ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return res.status(400).send(page(
      "Invalid link",
      "This confirmation link is invalid. Please sign up again."
    ));
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return res.status(500).send(page(
      "Something went wrong",
      "The confirmation service is temporarily unavailable."
    ));
  }

  try {
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const query = new URLSearchParams({
      email: `eq.${email}`,
      confirmation_token_hash: `eq.${tokenHash}`,
      confirmation_expires_at: `gt.${new Date().toISOString()}`,
      confirmed: "eq.false",
      select: "id"
    });

    const response = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/newsletter_subscribers?${query}`,
      {
        method: "PATCH",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          confirmed: true,
          confirmation_token_hash: null,
          confirmation_expires_at: null
        })
      }
    );

    if (!response.ok) {
      console.error("Confirmation database error:", await response.text());

      return res.status(500).send(page(
        "Something went wrong",
        "We couldn't confirm your subscription. Please try again later."
      ));
    }

    const updated = await response.json();

    if (!updated.length) {
      return res.status(400).send(page(
        "Link expired or already used",
        "This confirmation link has expired or has already been used. If you have already confirmed, you're all set."
      ));
    }

    return res.status(200).send(page(
      "You're confirmed!",
      "Thanks for confirming your email. You're now subscribed to Joinly updates."
    ));
  } catch (error) {
    console.error("Confirmation failed:", error);

    return res.status(500).send(page(
      "Something went wrong",
      "We couldn't confirm your subscription. Please try again later."
    ));
  }
};

function page(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | Joinly</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #111;
      color: #f5f5f5;
      font-family: Inter, Arial, sans-serif;
      text-align: center;
    }
    main {
      max-width: 480px;
      padding: 32px 24px;
    }
    h1 { font-size: 30px; }
    p { color: #bbb; line-height: 1.7; }
    a {
      display: inline-block;
      margin-top: 16px;
      color: #fff;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://joinly-bot.xyz/">Back to Joinly</a>
  </main>
</body>
</html>`;
}
