const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 4000;

// GET /authorize
app.get("/authorize", (req, res) => {
  const { redirect_uri, state, client_id, scope, sentry_trace, sentry_baggage } = req.query;

  if (!redirect_uri || !state) {
    return res.status(400).send("Missing required parameters: redirect_uri, state");
  }

  const authCode = `mock_code_${crypto.randomBytes(8).toString("hex")}`;

  // sentry_trace / sentry_baggage をJavaScriptに渡してコールバックURLに転送
  const sentryTrace = sentry_trace ? JSON.stringify(sentry_trace) : "null";
  const sentryBaggage = sentry_baggage ? JSON.stringify(sentry_baggage) : "null";

  res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mock IdP - 認可画面</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, sans-serif;
      background: #1a1a2e;
      color: #eee;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .card {
      background: #16213e;
      border: 1px solid #0f3460;
      border-radius: 12px;
      padding: 2rem;
      max-width: 420px;
      width: 100%;
    }
    .badge {
      display: inline-block;
      background: #e94560;
      color: white;
      font-size: 0.7rem;
      padding: 2px 8px;
      border-radius: 4px;
      margin-bottom: 1rem;
    }
    h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
    p { color: #aaa; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .info {
      background: #0f3460;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1.5rem;
      font-size: 0.85rem;
    }
    .info dt { color: #aaa; margin-bottom: 2px; }
    .info dd { margin-bottom: 0.75rem; color: #fff; word-break: break-all; }
    .info dd:last-child { margin-bottom: 0; }
    .actions { display: flex; gap: 0.75rem; }
    button {
      flex: 1;
      padding: 0.7rem;
      border: none;
      border-radius: 8px;
      font-size: 0.9rem;
      cursor: pointer;
      font-weight: 600;
    }
    .allow { background: #00b4d8; color: #fff; }
    .allow:hover { background: #0096c7; }
    .deny { background: #333; color: #aaa; }
    .deny:hover { background: #444; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">EXTERNAL IdP</span>
    <h1>アプリケーションの認可</h1>
    <p><strong>${client_id || "mock-app"}</strong> があなたのアカウントへのアクセスを要求しています。</p>
    <div class="info">
      <dl>
        <dt>要求されるスコープ</dt>
        <dd>${scope || "openid profile email"}</dd>
        <dt>リダイレクト先</dt>
        <dd>${redirect_uri}</dd>
        <dt>State</dt>
        <dd>${state}</dd>
      </dl>
    </div>
    <div class="actions">
      <button class="allow" onclick="approve()">許可する</button>
      <button class="deny" onclick="deny()">拒否する</button>
    </div>
  </div>
  <script>
    var sentryTrace = ${sentryTrace};
    var sentryBaggage = ${sentryBaggage};

    function buildUrl(base) {
      var url = new URL(base);
      if (sentryTrace) url.searchParams.set("sentry_trace", sentryTrace);
      if (sentryBaggage) url.searchParams.set("sentry_baggage", sentryBaggage);
      return url;
    }

    function approve() {
      var url = buildUrl(${JSON.stringify(redirect_uri)});
      url.searchParams.set("code", ${JSON.stringify(authCode)});
      url.searchParams.set("state", ${JSON.stringify(state)});
      window.location.href = url.toString();
    }
    function deny() {
      var url = buildUrl(${JSON.stringify(redirect_uri)});
      url.searchParams.set("error", "access_denied");
      url.searchParams.set("state", ${JSON.stringify(state)});
      window.location.href = url.toString();
    }
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Mock IdP is running on http://localhost:${PORT}`);
});
