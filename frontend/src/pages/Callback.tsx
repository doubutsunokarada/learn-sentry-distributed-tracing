import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import * as Sentry from "@sentry/react";

const API = "http://localhost:3000";

interface TokenResult {
  access_token: string;
  token_type: string;
  expires_in: number;
  id_token: string;
}

interface UserInfo {
  sub: string;
  name: string;
  email: string;
  email_verified: boolean;
  avatar_url?: string;
  locale?: string;
}

export default function Callback() {
  const [searchParams] = useSearchParams();
  const [tokenResult, setTokenResult] = useState<TokenResult | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [userInfoError, setUserInfoError] = useState<string | null>(null);
  const [fetchingUser, setFetchingUser] = useState(false);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const sentryTrace = searchParams.get("sentry_trace");
  const sentryBaggage = searchParams.get("sentry_baggage");

  // コールバック着地時にトレースを継続
  useEffect(() => {
    if (sentryTrace) {
      Sentry.continueTrace(
        {
          sentryTrace,
          baggage: sentryBaggage ?? undefined,
        },
        () => {
          Sentry.startSpan(
            {
              name: "auth.callback.landing",
              op: "auth.callback",
              attributes: {
                "auth.code": code ?? undefined,
                "auth.state": state ?? undefined,
                "auth.error": error ?? undefined,
              },
            },
            () => {}
          );
        }
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 1: トークン交換
  const handleTokenExchange = async () => {
    setExchanging(true);
    setTokenError(null);
    setTokenResult(null);
    setUserInfo(null);
    setUserInfoError(null);

    try {
      const res = await fetch(`${API}/api/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, state }),
      });

      if (!res.ok) {
        const text = await res.text();
        const err = new Error(
          `Token exchange failed: HTTP ${res.status} - ${text}`
        );
        Sentry.captureException(err);
        setTokenError(err.message);
        return;
      }

      const data = await res.json();
      setTokenResult(data);
    } catch (e) {
      const err =
        e instanceof Error ? e : new Error("Token exchange failed: Unknown");
      Sentry.captureException(err);
      setTokenError(err.message);
    } finally {
      setExchanging(false);
    }
  };

  // Step 2: ユーザー情報取得
  const handleFetchUserInfo = async () => {
    if (!tokenResult) return;
    setFetchingUser(true);
    setUserInfoError(null);
    setUserInfo(null);

    try {
      const res = await fetch(`${API}/api/auth/userinfo`, {
        headers: { Authorization: `Bearer ${tokenResult.access_token}` },
      });

      if (!res.ok) {
        const text = await res.text();
        const err = new Error(
          `UserInfo fetch failed: HTTP ${res.status} - ${text}`
        );
        Sentry.captureException(err);
        setUserInfoError(err.message);
        return;
      }

      const data = await res.json();
      setUserInfo(data);
    } catch (e) {
      const err =
        e instanceof Error ? e : new Error("UserInfo fetch failed: Unknown");
      Sentry.captureException(err);
      setUserInfoError(err.message);
    } finally {
      setFetchingUser(false);
    }
  };

  // Step 1+2 一括実行
  const handleFullFlow = async () => {
    setExchanging(true);
    setTokenError(null);
    setTokenResult(null);
    setUserInfo(null);
    setUserInfoError(null);

    try {
      // Token exchange
      const tokenRes = await fetch(`${API}/api/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, state }),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        const err = new Error(
          `Token exchange failed: HTTP ${tokenRes.status} - ${text}`
        );
        Sentry.captureException(err);
        setTokenError(err.message);
        return;
      }

      const tokenData: TokenResult = await tokenRes.json();
      setTokenResult(tokenData);

      // UserInfo fetch
      setFetchingUser(true);
      const userRes = await fetch(`${API}/api/auth/userinfo`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        const text = await userRes.text();
        const err = new Error(
          `UserInfo fetch failed: HTTP ${userRes.status} - ${text}`
        );
        Sentry.captureException(err);
        setUserInfoError(err.message);
        return;
      }

      const userData = await userRes.json();

      // フロントエンド固有のエラー: ユーザーデータの加工処理で失敗
      // 40%の確率でフロントエンド側のデータ処理エラーを発生させる
      if (Math.random() < 0.4) {
        const processingErr = new TypeError(
          `Failed to render user profile: Cannot read properties of undefined (reading 'avatarUrl') - userData.profile is ${typeof (userData as Record<string, unknown>).profile}`
        );
        Sentry.captureException(processingErr, {
          tags: { "error.origin": "frontend", "error.phase": "data_processing" },
          contexts: {
            userData: {
              keys: Object.keys(userData),
              hasProfile: "profile" in userData,
            },
          },
        });
        setUserInfoError(`フロントエンドエラー: ${processingErr.message}`);
        return;
      }

      setUserInfo(userData);
    } catch (e) {
      const err =
        e instanceof Error ? e : new Error("Auth flow failed: Unknown");
      Sentry.captureException(err);
      if (!tokenResult) {
        setTokenError(err.message);
      } else {
        setUserInfoError(err.message);
      }
    } finally {
      setExchanging(false);
      setFetchingUser(false);
    }
  };

  if (error) {
    return (
      <main className="flex justify-center pt-16 pb-4">
        <div className="w-full max-w-md space-y-6 px-4">
          <h1 className="text-2xl font-bold dark:text-white">
            Callback - Error
          </h1>
          <div className="rounded-xl border border-red-300 bg-red-50 p-6 space-y-3 dark:border-red-700 dark:bg-red-900/20">
            <p className="font-medium text-red-700 dark:text-red-400">
              認可が拒否されました
            </p>
            <dl className="text-sm space-y-2">
              <dt className="text-gray-500 dark:text-gray-400">Error</dt>
              <dd className="font-mono text-red-600 dark:text-red-400">
                {error}
              </dd>
            </dl>
          </div>
          <Link
            to="/login"
            className="block text-center text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            ログイン画面に戻る
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex justify-center pt-16 pb-4">
      <div className="w-full max-w-md space-y-6 px-4">
        <h1 className="text-2xl font-bold dark:text-white">
          Callback - 認可完了
        </h1>

        {/* 認可コード */}
        <div className="rounded-xl border border-green-300 bg-green-50 p-6 space-y-3 dark:border-green-700 dark:bg-green-900/20">
          <p className="font-medium text-green-700 dark:text-green-400">
            認可コールバックを受信しました
          </p>
          <dl className="text-sm space-y-2">
            <dt className="text-gray-500 dark:text-gray-400">
              Authorization Code
            </dt>
            <dd className="font-mono break-all dark:text-white">
              {code || "(none)"}
            </dd>
            <dt className="text-gray-500 dark:text-gray-400">State</dt>
            <dd className="font-mono break-all dark:text-white">
              {state || "(none)"}
            </dd>
          </dl>
        </div>

        {/* アクションボタン */}
        <div className="rounded-xl border border-gray-200 p-6 space-y-3 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            各ステップを個別に実行するか、一括で実行できます。
            <br />
            <span className="text-yellow-600 dark:text-yellow-400">
              (各ステップでランダムにエラーが発生します)
            </span>
          </p>
          <button
            onClick={handleFullFlow}
            disabled={exchanging || fetchingUser || !code}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {exchanging || fetchingUser
              ? "処理中..."
              : "一括実行 (トークン交換 → ユーザー情報取得)"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleTokenExchange}
              disabled={exchanging || !code}
              className="flex-1 rounded-lg bg-gray-600 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {exchanging ? "交換中..." : "Step1: トークン交換"}
            </button>
            <button
              onClick={handleFetchUserInfo}
              disabled={fetchingUser || !tokenResult}
              className="flex-1 rounded-lg bg-gray-600 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {fetchingUser ? "取得中..." : "Step2: ユーザー情報"}
            </button>
          </div>
        </div>

        {/* トークン交換エラー */}
        {tokenError && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Step1 エラー: トークン交換
            </p>
            <p className="mt-1 text-xs font-mono text-red-600 break-all dark:text-red-400">
              {tokenError}
            </p>
          </div>
        )}

        {/* トークン交換成功 */}
        {tokenResult && (
          <div className="rounded-xl border border-blue-300 bg-blue-50 p-6 space-y-3 dark:border-blue-700 dark:bg-blue-900/20">
            <p className="font-medium text-blue-700 dark:text-blue-400">
              Step1 成功: トークン交換
            </p>
            <dl className="text-sm space-y-2">
              <dt className="text-gray-500 dark:text-gray-400">
                Access Token
              </dt>
              <dd className="font-mono break-all dark:text-white">
                {tokenResult.access_token}
              </dd>
              <dt className="text-gray-500 dark:text-gray-400">ID Token</dt>
              <dd className="font-mono break-all dark:text-white">
                {tokenResult.id_token}
              </dd>
            </dl>
          </div>
        )}

        {/* ユーザー情報エラー */}
        {userInfoError && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Step2 エラー: ユーザー情報取得
            </p>
            <p className="mt-1 text-xs font-mono text-red-600 break-all dark:text-red-400">
              {userInfoError}
            </p>
          </div>
        )}

        {/* ユーザー情報成功 */}
        {userInfo && (
          <div className="rounded-xl border border-purple-300 bg-purple-50 p-6 space-y-3 dark:border-purple-700 dark:bg-purple-900/20">
            <p className="font-medium text-purple-700 dark:text-purple-400">
              Step2 成功: ユーザー情報
            </p>
            <dl className="text-sm space-y-2">
              <dt className="text-gray-500 dark:text-gray-400">Name</dt>
              <dd className="dark:text-white">{userInfo.name}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Email</dt>
              <dd className="dark:text-white">{userInfo.email}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Locale</dt>
              <dd className="dark:text-white">{userInfo.locale}</dd>
            </dl>
          </div>
        )}

        <Link
          to="/login"
          className="block text-center text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ログイン画面に戻る
        </Link>
      </div>
    </main>
  );
}
