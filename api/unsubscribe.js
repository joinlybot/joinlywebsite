const crypto = require("crypto");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed.");
  }

  const token =
    typeof req.query?.token === "string" ? req.query.token : "";

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).send(page(
      "Invalid link",
      "This unsubscribe link is invalid."
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
        "Already unsubscribed",
        "This link is invalid, expired, or has already been used. If you've already unsubscribed, no further action is needed."
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
      font-family: Arial, sans-serif;
      text-align: center;
    }
    main {
      max-width: 480px;
      padding: 32px 24px;
    }
    h1 { font-size: 30px; }
    p { color: #bbb; line-height: 1.7; }
    a { color: #fff; }
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
