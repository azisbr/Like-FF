import { supabaseAdmin, usernameToInternalEmail, generateOtp, sendTelegramMessage } from '../_supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { username, telegramId, displayName, password } = req.body || {};

  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(String(username))) {
    return res.status(400).json({ error: 'Username 3-20 karakter, hanya huruf/angka/underscore.' });
  }
  if (!telegramId || !/^\d+$/.test(String(telegramId))) {
    return res.status(400).json({ error: 'Telegram ID harus berupa angka.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter.' });
  }
  if (!displayName || displayName.trim().length < 2) {
    return res.status(400).json({ error: 'Nama minimal 2 karakter.' });
  }

  const supabase = supabaseAdmin();
  const usernameLower = String(username).toLowerCase();

  // Check if this username is already taken
  const { data: existingUsername } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', usernameLower)
    .maybeSingle();

  if (existingUsername) {
    return res.status(409).json({ error: 'Username ini sudah dipakai. Pilih yang lain.' });
  }

  // Check if this telegram id is already registered
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('telegram_id')
    .eq('telegram_id', String(telegramId))
    .maybeSingle();

  if (existingProfile) {
    return res.status(409).json({ error: 'Telegram ID ini sudah terdaftar dengan akun lain.' });
  }

  // Make sure this chat_id has started the bot — otherwise Telegram will reject the DM.
  const { data: contact } = await supabase
    .from('telegram_contacts')
    .select('telegram_id')
    .eq('telegram_id', String(telegramId))
    .maybeSingle();

  if (!contact) {
    return res.status(400).json({
      error: 'Buka bot Telegram dan kirim /start terlebih dahulu, lalu coba lagi.',
    });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // Password is held here only until register-verify consumes it (max 5 min),
  // at which point Supabase Auth takes over hashing/storage and this row is discarded.
  const { error: insertError } = await supabase.from('otp_codes').insert({
    telegram_id: String(telegramId),
    code: otp,
    purpose: 'register',
    pending_username: usernameLower,
    pending_display_name: displayName.trim(),
    pending_plain_password: password,
    expires_at: expiresAt,
  });

  if (insertError) {
    return res.status(500).json({ error: 'Gagal membuat kode verifikasi.' });
  }

  try {
    await sendTelegramMessage(
      telegramId,
      `Kode verifikasi pendaftaran Anda: ${otp}\n\nBerlaku 5 menit. Jangan bagikan kode ini ke siapa pun.`
    );
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  return res.status(200).json({ ok: true, message: 'Kode OTP telah dikirim ke Telegram Anda.' });
}
