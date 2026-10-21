const crypto = require("crypto");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const token =
    typeof (req.method === "POST" ? req.body?.token : req.query?.token)
      === "string"
      ? (req.method === "POST" ? req.body.token : req.query.token)
      : "";

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).send("Method not allowed.");
  }

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).send(page(
      "Invalid link",
      "This unsubscribe link is invalid or incomplete."
    ));
  }

  // Opening the link only displays a confirmation page.
  if (req.method === "GET") {
    return res.status(200).send(page(
      "Unsubscribe from Joinly?",
      "Click the button below to stop receiving Joinly newsletter updates.",
      token
    ));
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).send(page(
      "Something went wrong",
      "The unsubscribe service is temporarily unavailable."
    ));
  }

  try {
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const baseUrl = supabaseUrl.replace(/\/$/, "");

    const query = new URLSearchParams({
      unsubscribe_token_hash: `eq.${tokenHash}`,
      confirmed: "eq.true",
      unsubscribed_at: "is.null",
      select: "id"
    });

    const response = await fetch(
      `${baseUrl}/rest/v1/newsletter_subscribers?${query}`,
      {
        method: "PATCH",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          unsubscribed_at: new Date().toISOString(),
          unsubscribe_token_hash: null
        })
      }
    );

    if (!response.ok) {
      console.error("Unsubscribe database error:", await response.text());
      return res.status(500).send(page(
        "Something went wrong",
        "We couldn't process your request. Please try again later."
      ));
    }

    const updated = await response.json();

    if (!updated.length) {
      return res.status(200).send(page(
        "Link no longer active",
        "This link is invalid or has already been used. If you've already unsubscribed, no further action is needed."
      ));
    }

    return res.status(200).send(page(
      "You've unsubscribed",
      "You have been removed from Joinly newsletter updates."
    ));
  } catch (error) {
    console.error("Unsubscribe failed:", error);
    return res.status(500).send(page(
      "Something went wrong",
      "We couldn't process your request. Please try again later."
    ));
  }
};

function page(title, message, token = null) {
  const button = token
    ? `<form method="POST" action="/api/unsubscribe">
         <input type="hidden" name="token" value="${token}">
         <button type="submit">Confirm unsubscribe</button>
       </form>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${title} | Joinly</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #111;
      color: #f5f5f5;
      font-family: Arial, sans-serif;
      text-align: center;
    }
    main {
      max-width: 480px;
      padding: 32px 24px;
    }
    h1 { font-size: 30px; }
    p { color: #bbb; line-height: 1.7; }
    button {
      margin: 16px 0;
      padding: 12px 20px;
      border: 0;
      border-radius: 6px;
      background: #f5f5f5;
      color: #171717;
      cursor: pointer;
      font-size: 16px;
    }
    a { color: #fff; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${message}</p>
    ${button}
    <p><a href="https://joinly-bot.xyz/">Back to Joinly</a></p>
  </main>
</body>
</html>`;
}
