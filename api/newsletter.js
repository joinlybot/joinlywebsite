
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

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return res.status(500).json({
      error: "Newsletter service is not configured."
    });
  }

  try {
    const response = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/newsletter_subscribers`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          email,
          confirmed: false
        })
      }
    );

    if (response.status === 409) {
      return res.status(200).json({
        message: "Thanks! Your signup has been received."
      });
    }

    if (!response.ok) {
      const error = await response.text();
      console.error("Newsletter database error:", error);

      return res.status(500).json({
        error: "Could not save your signup. Please try again."
      });
    }

    return res.status(200).json({
      message: "Thanks for subscribing!"
    });
  } catch (error) {
    console.error("Newsletter signup failed:", error);

    return res.status(500).json({
      error: "Something went wrong. Please try again."
    });
  }
};
