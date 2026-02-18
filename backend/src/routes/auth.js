const express = require("express");
const crypto = require("crypto");
const Sentry = require("@sentry/node");
const router = express.Router();

const FRONTEND_ORIGIN = "http://localhost:5173";
const MOCK_IDP_ORIGIN = "http://localhost:4000";

// ユーティリティ: 指定msだけ待機
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GET /api/auth/authorize
// state, nonce を生成し、モックIdPへの認可URLを返す
router.get("/authorize", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: "mock-app",
    redirect_uri: `${FRONTEND_ORIGIN}/callback`,
    scope: "openid profile email",
    state,
    nonce,
  });

  // 現在のスパンからトレースコンテキストを取得し、クエリパラメータに付与
  const span = Sentry.getActiveSpan();
  if (span) {
    const rootSpan = Sentry.getRootSpan(span);
    const traceData = Sentry.spanToTraceHeader(span);
    const baggage = Sentry.spanToBaggageHeader(rootSpan);
    if (traceData) params.set("sentry_trace", traceData);
    if (baggage) params.set("sentry_baggage", baggage);
  }

  res.json({
    authorization_url: `${MOCK_IDP_ORIGIN}/authorize?${params}`,
  });
});

// POST /api/auth/token
// 認可コードをトークンに交換する（モック）
// 50%の確率でエラーを発生させる
router.post("/token", async (req, res) => {
  const { code, state } = req.body;

  if (!code || !state) {
    throw new Error("Token exchange failed: missing code or state");
  }

  // IdPへのトークンリクエストをシミュレート
  await Sentry.startSpan(
    { name: "idp.token_request", op: "http.client" },
    async () => {
      await sleep(200 + Math.random() * 300);
    }
  );

  // 50%の確率でサーバーエラーを発生
  if (Math.random() < 0.5) {
    throw new Error(
      "Token exchange failed: IdP returned invalid_grant - The authorization code has expired"
    );
  }

  const accessToken = `mock_access_${crypto.randomBytes(16).toString("hex")}`;

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    id_token: `mock_id_token_${crypto.randomBytes(16).toString("hex")}`,
  });
});

// GET /api/auth/userinfo
// access_token を検証してユーザー情報を返す
// DB問い合わせ + 外部APIコールをシミュレート
router.get("/userinfo", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid access token" });
  }

  const token = authHeader.slice(7);

  // トークン検証をシミュレート
  await Sentry.startSpan(
    { name: "auth.verify_token", op: "auth" },
    async () => {
      await sleep(50 + Math.random() * 100);

      // 30%の確率でトークン失効エラー
      if (Math.random() < 0.3) {
        throw new Error(`Token verification failed: token ${token.slice(0, 20)}... is expired`);
      }
    }
  );

  // DBからユーザー情報取得をシミュレート
  const user = await Sentry.startSpan(
    { name: "db.find_user", op: "db.query" },
    async () => {
      await sleep(100 + Math.random() * 200);
      return {
        sub: "mock-user-001",
        name: "Mock User",
        email: "mock@example.com",
        email_verified: true,
      };
    }
  );

  // 外部プロフィールサービスへの問い合わせをシミュレート
  const profile = await Sentry.startSpan(
    { name: "external.profile_service", op: "http.client" },
    async () => {
      await sleep(150 + Math.random() * 250);

      // 20%の確率でタイムアウトエラー
      if (Math.random() < 0.2) {
        throw new Error("Profile service timeout: ETIMEDOUT after 5000ms");
      }

      return {
        avatar_url: "https://example.com/avatar/mock-user-001.png",
        locale: "ja-JP",
      };
    }
  );

  res.json({ ...user, ...profile });
});

module.exports = router;
