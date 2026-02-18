import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // DSNからホストとプロジェクトIDを抽出
  // 例: https://publickey@o123.ingest.us.sentry.io/456
  const dsnUrl = new URL(env.VITE_SENTRY_DSN || "https://dummy@dummy.ingest.sentry.io/0");
  const sentryHost = `${dsnUrl.protocol}//${dsnUrl.host}`;
  const sentryProjectId = dsnUrl.pathname.replace("/", "");

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
        },
        // Sentryへのリクエストを中継し、広告ブロッカーを回避
        "/sentry-tunnel": {
          target: sentryHost,
          changeOrigin: true,
          rewrite: () => `/api/${sentryProjectId}/envelope/`,
        },
      },
    },
  };
});
