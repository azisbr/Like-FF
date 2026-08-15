# UID Tools — Setup

## 1. Environment Variables (Vercel → Project Settings → Environment Variables)

Set these — **do not** put any of them in front-end code or commit them to git:

| Name | Value | Where to find it |
|---|---|---|
| `SUPABASE_URL` | `https://jswyipeyxgcduzvpvyts.supabase.co` | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | your anon/publishable key | Supabase → Settings → API (safe to expose, but kept server-side here too) |
| `SUPABASE_SERVICE_ROLE_KEY` | your **secret**/service_role key | Supabase → Settings → API → Secret keys. **Rotate immediately if it was ever pasted anywhere outside Vercel.** |
| `TELEGRAM_BOT_TOKEN` | your bot token from @BotFather | Telegram @BotFather |

## 2. Deploy

Push this folder to a GitHub repo and import it into Vercel, or run `vercel deploy` from this folder with the Vercel CLI. The `api/` folder becomes serverless functions automatically; `public/index.html` is served as the site.

## 3. Telegram bot requirement

Because Telegram bots cannot message a user who hasn't interacted with them first, every user must open your bot and send `/start` **before** they register or log in. The app enforces this automatically via a webhook (see below) — if someone tries to register without having started the bot, they get a clear error telling them to do so.

### Setting up the webhook (one-time, after your first deploy)

Once your Vercel deployment is live, tell Telegram where to send bot updates by visiting this URL once in your browser (replace both placeholders):

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_VERCEL_DOMAIN>/api/telegram/webhook
```

You should get back `{"ok":true,"result":true,...}`. From then on, whenever someone sends `/start` (or anything else) to your bot, Telegram forwards it to `api/telegram/webhook.js`, which records their chat ID as reachable and replies with their numeric Telegram ID (which they'll need for registration).

## 4. What each file does

- `api/_supabaseAdmin.js` — shared server-only helpers (never imported by the browser)
- `api/auth/register-request.js` — validates signup input, sends OTP via Telegram
- `api/auth/register-verify.js` — checks OTP, creates the real Supabase Auth user + profile row
- `api/auth/login-request.js` — checks password, sends OTP via Telegram
- `api/auth/login-verify.js` — checks OTP, returns a real Supabase session to the browser
- `api/telegram/webhook.js` — receives Telegram bot updates (like `/start`), records the user's chat ID as reachable
- `api/proxy.js` — the only endpoint the browser ever calls for visit/info/like; hides the real third-party URLs and enforces the 1-like-per-12-hours-per-user limit server-side
- `public/index.html` — the whole front-end (auth forms + the 3-tab tool)

## 5. Security notes

- The real visit/info/like endpoints are only ever called from `api/proxy.js` (server-side), so they never appear in the browser's Network tab.
- The 12-hour like limit is enforced by checking the `like_logs` table on the server — a user can't bypass it by clearing cookies or using incognito, since it's tied to their authenticated account, not their browser.
- Passwords are handled entirely by Supabase Auth's own hashing; this app never stores a raw or custom-hashed password itself.
