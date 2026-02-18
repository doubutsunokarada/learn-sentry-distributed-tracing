# learn-sentry-distributed-tracing

Sentry の Distributed Tracing（分散トレーシング）を学ぶためのデモプロジェクト。
OIDC 認可コードフローをモックで再現し、フロントエンド → バックエンド → 外部IdP → コールバックという複数サービスをまたぐリクエストを **1つのトレース** として追跡します。

## アーキテクチャ

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend      │     │    Backend       │     │    Mock IdP      │
│  Vite + React    │     │    Express       │     │    Express       │
│  :5173           │     │    :3000         │     │    :4000         │
│                  │     │                  │     │                  │
│  @sentry/react   │     │  @sentry/node    │     │  (Sentry なし)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## OIDC 認可フロー

```
1. [Frontend /login]
   │  「外部認証でログイン」ボタン押下
   │
2. │── fetch GET /api/auth/authorize ──→ [Backend]
   │                                      state, nonce を生成
   │                                      sentry_trace, sentry_baggage を
   │                                      クエリパラメータに付与した認可URLを返却
   │
3. │── window.location.href ──→ [Mock IdP /authorize]
   │                             認可画面を表示（「許可する」「拒否する」）
   │
4. │←─ リダイレクト ───────────── 「許可する」押下
   │   /callback?code=xxx&state=xxx&sentry_trace=xxx&sentry_baggage=xxx
   │
5. [Frontend /callback]
   │  Sentry.continueTrace() でトレースを復元
   │
   │── fetch POST /api/auth/token ──→ [Backend]
   │                                    トークン交換 (50%でエラー)
   │
   │── fetch GET /api/auth/userinfo ──→ [Backend]
   │                                     トークン検証 → DB問い合わせ → 外部API
   │                                     (各ステップでランダムにエラー発生)
```

## Distributed Tracing の仕組み

### 通常の HTTP リクエスト（fetch）

`@sentry/react` の `browserTracingIntegration` が `sentry-trace` / `baggage` ヘッダーを自動付与し、`@sentry/node` が自動で受け取ってトレースを継続します。

```
Frontend fetch → [sentry-trace: abc-1] → Backend (同じ trace-id: abc)
```

### ブラウザリダイレクト経由（外部IdP）

ブラウザリダイレクトでは HTTP ヘッダーが引き継がれないため、**クエリパラメータ**でトレースコンテキストを転送します。

```
Backend  → 認可URLに sentry_trace, sentry_baggage をクエリパラメータで付与
Mock IdP → コールバックURLにそのまま転送（素通し）
Frontend → Sentry.continueTrace() でトレースを復元
```

### Sentry で見えるトレース構造

```
[Frontend] pageload /login
  └─ [Frontend] fetch GET /api/auth/authorize
      └─ [Backend] GET /api/auth/authorize
          └─ (sentry_trace をクエリパラメータに付与)

     ~~~ Mock IdP 経由のリダイレクト (Sentry なし) ~~~

[Frontend] /callback (continueTrace で同一トレースに接続)
  └─ [Frontend] fetch POST /api/auth/token
  │   └─ [Backend] POST /api/auth/token
  │       └─ idp.token_request (http.client, 200-500ms)
  │       └─ ※ 50% で Error throw
  └─ [Frontend] fetch GET /api/auth/userinfo
      └─ [Backend] GET /api/auth/userinfo
          ├─ auth.verify_token   (auth)        ← 30% でエラー
          ├─ db.find_user        (db.query)
          └─ external.profile_service (http.client) ← 20% でタイムアウト
```

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

Sentry プロジェクトの DSN を設定します。

```bash
# frontend/.env
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# backend/.env
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

### 3. 起動

```bash
# 3プロセスまとめて起動
npm run dev

# 個別起動
npm run dev:frontend   # :5173
npm run dev:backend    # :3000
npm run dev:mock-idp   # :4000
```

### 4. 動作確認

1. `http://localhost:5173` にアクセス → `/login` にリダイレクト
2. 「外部認証でログイン」ボタンを押す
3. Mock IdP 画面で「許可する」を押す
4. Callback ページで「一括実行」ボタンを押す
5. Sentry ダッシュボードの **Traces** ビューでフロー全体を確認

## プロジェクト構成

```
├── frontend/
│   ├── src/
│   │   ├── main.tsx              # エントリポイント (BrowserRouter)
│   │   ├── sentry.ts            # Sentry 初期化 (tracePropagationTargets)
│   │   ├── index.css             # Tailwind CSS
│   │   └── pages/
│   │       ├── Login.tsx         # ログインページ
│   │       └── Callback.tsx      # コールバック + トレース継続 + トークン交換
│   ├── .env                      # VITE_SENTRY_DSN
│   └── vite.config.ts
│
├── backend/
│   ├── src/
│   │   ├── index.js              # Express サーバー + Sentry ErrorHandler
│   │   ├── sentry.js             # Sentry 初期化 (dotenv)
│   │   └── routes/
│   │       └── auth.js           # /authorize, /token, /userinfo
│   └── .env                      # SENTRY_DSN
│
├── mock-idp/
│   └── src/
│       └── index.js              # 認可画面 HTML (Sentry なし、クエリパラメータ素通し)
│
└── package.json                  # npm workspaces (frontend, backend, mock-idp)
```

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| Frontend | Vite, React 19, React Router DOM 7, Tailwind CSS 4, @sentry/react |
| Backend | Express 5, @sentry/node, dotenv |
| Mock IdP | Express 5 (Sentry SDK なし) |
| 開発 | TypeScript, nodemon, npm workspaces |
