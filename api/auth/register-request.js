import { supabaseAdmin, telegramIdToInternalEmail, generateOtp, sendTelegramMessage } from '../_supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { telegramId, displayName, password } = req.body || {};

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
  const email = telegramIdToInternalEmail(telegramId);

  // Check if this telegram id is already registered
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('telegram_id')
    .eq('telegram_id', String(telegramId))
    .maybeSingle();

  if (existingProfile) {
    return res.status(409).json({ error: 'Telegram ID ini sudah terdaftar. Silakan login.' });
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
