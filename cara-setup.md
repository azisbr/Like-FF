# Cara Setup

## Kenalan dulu sama 3 pemainnya

**GitHub** — tempat nyimpen kode. Kayak Google Drive tapi khusus buat kode. Kamu upload folder project ke sini, nanti Vercel yang ambil dari sini buat di-deploy.

**Vercel** — yang "menjalankan" website-nya. Dia ambil kode dari GitHub, otomatis di-build, terus dikasih link publik (misal `like-ff-jet.vercel.app`). Vercel juga yang ngejalanin bagian backend (folder `api/`) — tiap ada request ke `/api/proxy` atau `/api/auth/login`, itu Vercel yang eksekusi kodenya di server, bukan HP/browser user. Makanya URL API asli, token bot, dan secret key gak pernah keliatan dari luar.

**Supabase** — database + sistem login. Nyimpen data akun (username, password yang udah di-hash, riwayat like), dan yang nge-cek "user ini beneran terdaftar gak, passwordnya cocok gak" tiap kali ada yang coba login.

Alurnya kira-kira: User buka web (dari Vercel) → isi form login → Vercel nanya ke Supabase "ini valid gak?" → Supabase jawab → Vercel kasih token ke browser sebagai tanda udah login → tiap aksi selanjutnya (like, cek info) tetap lewat Vercel dulu, gak pernah browser langsung connect ke Supabase atau API pihak ketiga.

## 1. Environment Variables (Vercel → Project Settings → Environment Variables)

Ini kayak "kunci rahasia" yang dipegang Vercel doang, gak pernah nempel di kode yang bisa dibaca orang:

| Nama | Isi | Dapetnya dari mana |
|---|---|---|
| `SUPABASE_URL` | `https://jswyipeyxgcduzvpvyts.supabase.co` | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | anon/publishable key | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | secret/service_role key | Supabase → Settings → API → Secret keys. **Ganti langsung kalau ini pernah kepaste di tempat lain selain Vercel.** |
| `TELEGRAM_BOT_TOKEN` | token bot | Telegram @BotFather |
| `ADMIN_USERNAME` | username admin | bebas kamu tentuin |
| `ADMIN_PASSWORD` | password admin | bebas kamu tentuin |
| `ADMIN_TOKEN_SECRET` | string acak panjang | bebas, buat tanda tangan token admin |

## 2. Deploy

Push folder ini ke repo GitHub, import ke Vercel — atau `vercel deploy` langsung dari folder ini pakai Vercel CLI. Folder `api/` otomatis jadi serverless function, `public/index.html` yang di-serve sebagai website-nya.

## 3. Syarat bot Telegram

Bot Telegram gak bisa DM orang yang belum pernah ngobrol sama dia duluan. Jadi tiap user wajib buka bot dan kirim `/start` **sebelum** daftar/login. Ini udah otomatis dicek lewat webhook — kalau ada yang coba daftar tanpa `/start` dulu, langsung dikasih pesan error yang jelas suruh `/start` dulu.

### Setup webhook (sekali aja, setelah deploy pertama)

Setelah Vercel live, kasih tau Telegram ke mana harus kirim update, buka URL ini sekali di browser (ganti dua placeholder-nya):

```
https://api.telegram.org/bot<TOKEN_BOT_KAMU>/setWebhook?url=https://<DOMAIN_VERCEL_KAMU>/api/telegram/webhook
```

Harus balik `{"ok":true,"result":true,...}`. Setelah itu, tiap ada yang `/start` bot, Telegram otomatis forward ke `api/telegram/webhook.js`, yang nyatet chat ID-nya dan bales dengan Telegram ID mereka.

## 4. Fungsi tiap file

- `api/_supabaseAdmin.js` — helper server-only (gak pernah diimport browser)
- `api/auth/register-request.js` — validasi input daftar (username + Telegram ID + password), kirim OTP via Telegram
- `api/auth/register-verify.js` — cek OTP, bikin akun Supabase Auth + baris profil (kunci di username)
- `api/auth/login.js` — cek username + password langsung ke Supabase Auth, langsung kasih session (tanpa OTP)
- `api/auth/admin-login.js` — login terpisah pakai kredensial fixed buat akun admin, gak lewat Supabase sama sekali
- `api/telegram/webhook.js` — nerima update dari bot Telegram (kayak `/start`), nyatet chat ID user
- `api/proxy.js` — satu-satunya endpoint yang dipanggil browser buat visit/info/like; nyembunyiin URL asli pihak ketiga dan nge-enforce limit like 1x/12 jam di server
- `public/index.html` — seluruh front-end (form auth + tool 3-tab)

## 5. Catatan keamanan

- Endpoint visit/info/like asli cuma pernah dipanggil dari `api/proxy.js` (di server), jadi gak pernah muncul di tab Network browser user.
- Limit like 12 jam dicek pakai fungsi database yang atomic (row-locking) — gak bisa dibypass walau di-spam klik cepat/paralel.
- Endpoint info/visit yang gak perlu login dibatasi 2 detik per IP per aksi, juga atomic di database.
- Password sepenuhnya dihandle hashing-nya oleh Supabase Auth; app ini gak pernah nyimpen password mentah/hash custom sendiri.
- Semua tabel Supabase pakai Row Level Security (RLS) — client cuma bisa baca data miliknya sendiri, gak bisa insert/update langsung buat ngakalin limit.
