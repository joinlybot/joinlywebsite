const crypto = require("crypto");

const COOKIE = "joinly_admin_session";

function makeSession(username, password) {
  const expires = String(Date.now() + 8 * 60 * 60 * 1000);

  const signature = crypto
    .createHmac("sha256", password)
    .update(`${username}:${expires}`)
    .digest("hex");

  return `${expires}.${signature}`;
}

function validSession(req, username, password) {
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

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    return res.status(500).send("Admin login is not configured.");
  }

  if (req.method === "POST" && req.query?.action === "login") {
    const suppliedUser =
      typeof req.body?.username === "string" ? req.body.username : "";
    const suppliedPass =
      typeof req.body?.password === "string" ? req.body.password : "";

    const userBuffer = Buffer.from(suppliedUser);
    const expectedUser = Buffer.from(username);
    const passBuffer = Buffer.from(suppliedPass);
    const expectedPass = Buffer.from(password);

    const userOK =
      userBuffer.length === expectedUser.length &&
      crypto.timingSafeEqual(userBuffer, expectedUser);

    const passOK =
      passBuffer.length === expectedPass.length &&
      crypto.timingSafeEqual(passBuffer, expectedPass);

    if (!userOK || !passOK) {
      return res.status(401).json({
        error: "Incorrect username or password."
      });
    }

    const session = makeSession(username, password);

    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${session}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=28800`
    );

    return res.status(200).json({
      message: "Login successful."
    });
  }

  if (req.method === "POST" && req.query?.action === "logout") {
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0`
    );

    return res.status(200).json({
      message: "Logged out."
    });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).send("Method not allowed.");
  }

  if (req.query?.action === "check") {
    return res.status(200).json({
      authenticated: validSession(req, username, password)
    });
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Joinly Newsletter Admin</title>
  <style>
    body {
      margin: 0;
      background: #111;
      color: #f5f5f5;
      font: 16px Arial, sans-serif;
    }

    main {
      max-width: 680px;
      margin: 40px auto;
      padding: 24px;
    }

    input, textarea, button {
      box-sizing: border-box;
      width: 100%;
      padding: 12px;
      margin: 8px 0 16px;
      border-radius: 6px;
      border: 1px solid #444;
      font: inherit;
    }

    input, textarea {
      background: #1d1d1d;
      color: #fff;
    }

    textarea {
      min-height: 180px;
      resize: vertical;
    }

    button {
      background: #f5f5f5;
      color: #111;
      border: 0;
      cursor: pointer;
      font-weight: bold;
    }

    button.secondary {
      background: #292929;
      color: #fff;
    }

    .panel {
      border: 1px solid #333;
      border-radius: 10px;
      padding: 20px;
      margin-top: 20px;
    }

    .muted {
      color: #aaa;
      line-height: 1.5;
    }

    #status {
      white-space: pre-wrap;
    }

    #preview {
      background: #fff;
      color: #222;
      padding: 20px;
      border-radius: 6px;
      overflow-wrap: anywhere;
    }

    [hidden] {
      display: none !important;
    }
  </style>
</head>
<body>
<main>
  <h1>Joinly Newsletter</h1>
  <p class="muted">Private newsletter dashboard</p>

  <section id="login" class="panel">
    <h2>Admin login</h2>

    <form id="loginForm">
      <label for="username">Username</label>
      <input
        id="username"
        autocomplete="username"
        required
      >

      <label for="password">Password</label>
      <input
        id="password"
        type="password"
        autocomplete="current-password"
        required
      >

      <button type="submit">Log in</button>
    </form>
  </section>

  <section id="editor" class="panel" hidden>
    <h2>Write a newsletter</h2>

    <form id="newsletterForm">
      <label for="subject">Email subject</label>
      <input id="subject" maxlength="180" required>

      <label for="message">Message</label>
      <textarea
        id="message"
        maxlength="10000"
        required
        placeholder="Write your newsletter here. Separate paragraphs with blank lines."
      ></textarea>

      <button type="button" class="secondary" id="previewButton">
        Preview email
      </button>

      <div id="preview" hidden></div>

      <button type="submit">
        Send newsletter to confirmed subscribers
      </button>
    </form>

    <button type="button" class="secondary" id="logoutButton">
      Log out
    </button>
  </section>

  <p id="status" role="status" class="muted"></p>
</main>

<script>
const loginPanel = document.getElementById("login");
const editor = document.getElementById("editor");
const statusBox = document.getElementById("status");
const subjectInput = document.getElementById("subject");
const messageInput = document.getElementById("message");
const preview = document.getElementById("preview");

function showEditor(loggedIn) {
  loginPanel.hidden = loggedIn;
  editor.hidden = !loggedIn;
}

async function checkSession() {
  try {
    const response = await fetch("/api/admin?action=check", {
      credentials: "same-origin"
    });

    const data = await response.json();
    showEditor(data.authenticated === true);
  } catch {
    showEditor(false);
  }
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  statusBox.textContent = "Logging in…";

  try {
    const response = await fetch("/api/admin?action=login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: document.getElementById("username").value,
        password: document.getElementById("password").value
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Login failed.");
    }

    document.getElementById("password").value = "";
    statusBox.textContent = "";
    showEditor(true);
  } catch (error) {
    statusBox.textContent = error.message;
  }
});

document.getElementById("previewButton").addEventListener("click", () => {
  const escapeHTML = (value) =>
    value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);

  const paragraphs = messageInput.value
    .split(/\\n\\s*\\n/)
    .map((paragraph) =>
      "<p>" + escapeHTML(paragraph).replace(/\\n/g, "<br>") + "</p>"
    )
    .join("");

  preview.innerHTML =
    "<h2>" + escapeHTML(subjectInput.value) + "</h2>" +
    paragraphs +
    "<hr><p style='font-size:12px;color:#666'>" +
    "An unsubscribe link will be included in the email.</p>";

  preview.hidden = false;
});

document.getElementById("newsletterForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!confirm("Send this newsletter to all confirmed, active subscribers?")) {
    return;
  }

  statusBox.textContent = "Sending… Please keep this page open.";

  try {
    const response = await fetch("/api/send-newsletter", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        subject: subjectInput.value.trim(),
        message: messageInput.value
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Sending failed.");
    }

    statusBox.textContent = data.message || "Newsletter sending finished.";
  } catch (error) {
    statusBox.textContent = error.message;
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await fetch("/api/admin?action=logout", {
    method: "POST",
    credentials: "same-origin"
  });

  showEditor(false);
  statusBox.textContent = "You have logged out.";
});

checkSession();
</script>
</body>
</html>`);
};
