# Cara Setup

## Kenalan dulu sama 3 pemainnya

**GitHub** — tempat nyimpen kode. Kayak Google Drive tapi khusus buat kode. Kamu upload folder project ke sini, nanti Vercel yang ambil dari sini buat di-deploy.

**Vercel** — yang "menjalankan" website-nya. Dia ambil kode dari GitHub, otomatis di-build, terus dikasih link publik (misal `like-ff-jet.vercel.app`). Vercel juga yang ngejalanin bagian backend (folder `api/`) — tiap ada request ke `/api/proxy` atau `/api/auth/login`, itu Vercel yang eksekusi kodenya di server, bukan HP/browser user. Makanya URL API asli, token bot, dan secret key gak pernah keliatan dari luar.

**Supabase** — database + sistem login. Nyimpen data akun (username, password yang udah di-hash, riwayat like), dan yang nge-cek "user ini beneran terdaftar gak, passwordnya cocok gak" tiap kali ada yang coba login.

Alurnya kira-kira: User buka web (dari Vercel) → isi form login → Vercel nanya ke Supabase "ini valid gak?" → Supabase jawab → Vercel kasih token ke browser sebagai tanda udah login → tiap aksi selanjutnya (like, cek info) tetap lewat Vercel dulu, gak pernah browser langsung connect ke Supabase atau API pihak ketiga.

## 1. Isi Supabase (tabel-tabelnya ngapain aja)

Supabase yang dipakai ada 5 tabel + 2 "fungsi" (kode yang jalan di dalam database-nya sendiri, bukan di Vercel). Semua tabel ini RLS-nya ON dan gak ada policy buat publik — jadi browser gak bisa baca/tulis langsung, semuanya wajib lewat `api/proxy.js` atau `api/auth/*.js` di Vercel dulu.

**`profiles`** — data akun tiap user. Isinya: `user_id` (nyambung ke sistem login bawaan Supabase), `username` (buat login), `telegram_id`, `display_name`, `created_at`. Satu baris = satu akun.

**`otp_codes`** — tempat parkir sementara kode OTP pas orang lagi daftar. Isinya kode 6 digit, kapan expired-nya, dan data pendaftaran yang "digantung" (username, password, display name) sampai OTP-nya bener diverifikasi. Begitu akun jadi, baris ini dihapus — gak numpuk data password mentah selamanya.

**`telegram_contacts`** — daftar siapa aja yang udah pernah `/start` bot. Fungsinya buat ngecek "orang ini bisa di-DM bot gak" sebelum kirim OTP — soalnya bot Telegram gak bisa DM orang yang belum pernah ngobrol duluan.

**`like_logs`** — riwayat tiap kali user berhasil like. Dipakai buat ngitung "udah 12 jam belum sejak like terakhir". Baris baru cuma nambah, gak pernah diedit/dihapus.

**`request_throttle`** — nyimpen kapan terakhir kali tiap IP address minta data info/visit. Dipakai buat batasi 2 detik antar request, biar gak di-spam.

**Fungsi `try_record_like`** — logic "boleh like apa nggak" ditulis di sini, bukan di kode Vercel. Alasannya: kalau ditulis di Vercel biasa (cek dulu baru simpan), dua request yang datang bersamaan bisa dua-duanya lolos cek sebelum sempat ke-simpen (istilahnya *race condition*). Fungsi ini ngunci baris user itu dulu (`FOR UPDATE`) sebelum ngecek, jadi request kedua otomatis nunggu request pertama kelar — gak mungkin lagi dua-duanya lolos bareng.

**Fungsi `try_throttle`** — logic yang sama tapi buat rate limit 2 detik di info/visit, per IP.

Kedua fungsi ini di-set cuma bisa dipanggil sama `service_role` (kunci rahasia yang cuma dipegang Vercel) — user gak bisa manggil langsung walau tau namanya.

## 2. Environment Variables (Vercel → Project Settings → Environment Variables)

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

## 3. Deploy

Push folder ini ke repo GitHub, import ke Vercel — atau `vercel deploy` langsung dari folder ini pakai Vercel CLI. Folder `api/` otomatis jadi serverless function, `public/index.html` yang di-serve sebagai website-nya.

## 4. Syarat bot Telegram

Bot Telegram gak bisa DM orang yang belum pernah ngobrol sama dia duluan. Jadi tiap user wajib buka bot dan kirim `/start` **sebelum** daftar/login. Ini udah otomatis dicek lewat webhook — kalau ada yang coba daftar tanpa `/start` dulu, langsung dikasih pesan error yang jelas suruh `/start` dulu.

### Setup webhook (sekali aja, setelah deploy pertama)

Setelah Vercel live, kasih tau Telegram ke mana harus kirim update, buka URL ini sekali di browser (ganti dua placeholder-nya):

```
https://api.telegram.org/bot<TOKEN_BOT_KAMU>/setWebhook?url=https://<DOMAIN_VERCEL_KAMU>/api/telegram/webhook
```

Harus balik `{"ok":true,"result":true,...}`. Setelah itu, tiap ada yang `/start` bot, Telegram otomatis forward ke `api/telegram/webhook.js`, yang nyatet chat ID-nya dan bales dengan Telegram ID mereka.

## 5. Fungsi tiap file

- `api/_supabaseAdmin.js` — helper server-only (gak pernah diimport browser)
- `api/auth/register-request.js` — validasi input daftar (username + Telegram ID + password), kirim OTP via Telegram
- `api/auth/register-verify.js` — cek OTP, bikin akun Supabase Auth + baris profil (kunci di username)
- `api/auth/login.js` — cek username + password langsung ke Supabase Auth, langsung kasih session (tanpa OTP)
- `api/auth/forgot-password-request.js` — cari akun by username, kirim OTP reset ke Telegram terhubung (respons generik biar gak bisa dipakai nebak username terdaftar)
- `api/auth/forgot-password-verify.js` — cek OTP, ganti password akun via Supabase Auth admin API
- `api/auth/admin-login.js` — login terpisah pakai kredensial fixed buat akun admin, gak lewat Supabase sama sekali
- `api/telegram/webhook.js` — nerima update dari bot Telegram (kayak `/start`), nyatet chat ID user
- `api/proxy.js` — satu-satunya endpoint yang dipanggil browser buat visit/info/like; nyembunyiin URL asli pihak ketiga dan nge-enforce limit like 1x/12 jam di server
- `api/jwt.js` — ambil JWT dari UID+password (satu akun atau bulk lewat file .txt/.json), butuh login, ada jeda 600ms antar-request pas mode bulk biar gak kena rate limit dari layanan JWT-nya
- `public/index.html` — seluruh front-end (form auth + tool 3-tab)

## 6. Catatan keamanan

- Endpoint visit/info/like asli cuma pernah dipanggil dari `api/proxy.js` (di server), jadi gak pernah muncul di tab Network browser user.
- Limit like 12 jam dicek pakai fungsi database yang atomic (row-locking) — gak bisa dibypass walau di-spam klik cepat/paralel.
- Endpoint info/visit yang gak perlu login dibatasi 2 detik per IP per aksi, juga atomic di database.
- Password sepenuhnya dihandle hashing-nya oleh Supabase Auth; app ini gak pernah nyimpen password mentah/hash custom sendiri.
- Semua tabel Supabase pakai Row Level Security (RLS) — client cuma bisa baca data miliknya sendiri, gak bisa insert/update langsung buat ngakalin limit.
