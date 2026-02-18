import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,

  // 広告ブロッカー回避: Sentryへの送信を自サーバー経由にする
  tunnel: "/sentry-tunnel",

  // パフォーマンスモニタリング
  tracesSampleRate: 1.0,

  // セッションリプレイ
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // backend へのリクエストに sentry-trace / baggage ヘッダーを付与
  tracePropagationTargets: ["localhost:3000"],

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
});
