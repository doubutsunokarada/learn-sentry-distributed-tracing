import { useState } from "react";
import * as Sentry from "@sentry/react";

const API = "http://localhost:3000";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/auth/authorize`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // フロントエンド固有のエラー: レスポンスのバリデーション失敗
      // 30%の確率でフロントエンド側のURL検証エラーを発生させる
      if (Math.random() < 0.3) {
        const validationErr = new Error(
          `Authorization URL validation failed: URL scheme must be https in production, got "${new URL(data.authorization_url).protocol}" - potential security risk detected`
        );
        Sentry.captureException(validationErr, {
          tags: { "error.origin": "frontend", "error.phase": "url_validation" },
          contexts: {
            authorization: {
              url_origin: new URL(data.authorization_url).origin,
              has_state: data.authorization_url.includes("state="),
            },
          },
        });
        setError(`フロントエンドエラー: ${validationErr.message}`);
        setLoading(false);
        return;
      }

      window.location.href = data.authorization_url;
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed to start authorization");
      Sentry.captureException(err, {
        tags: { "error.origin": "frontend", "error.phase": "authorize_request" },
      });
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <main className="flex justify-center pt-16 pb-4">
      <div className="w-full max-w-md space-y-6 px-4">
        <h1 className="text-2xl font-bold dark:text-white">Login</h1>

        <div className="rounded-xl border border-gray-200 p-6 space-y-4 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            外部IdPを使用してログインします。
            <br />
            ボタンを押すと認可画面にリダイレクトされます。
          </p>
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "リダイレクト中..." : "外部認証でログイン"}
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </main>
  );
}
