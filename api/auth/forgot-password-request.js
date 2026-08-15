import { supabaseAdmin, generateOtp, sendTelegramMessage } from '../_supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { username } = req.body || {};
  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(String(username))) {
    return res.status(400).json({ error: 'Masukkan username yang valid.' });
  }

  const supabase = supabaseAdmin();
  const usernameLower = String(username).toLowerCase();

  const { data: profile } = await supabase
    .from('profiles')
    .select('telegram_id')
    .eq('username', usernameLower)
    .maybeSingle();

  // Always return the same generic message whether or not the username exists —
  // this avoids leaking which usernames are registered.
  const genericMessage = 'Jika username terdaftar, kode reset telah dikirim ke Telegram yang terhubung.';

  if (!profile) {
    return res.status(200).json({ ok: true, message: genericMessage });
  }

  const telegramId = profile.telegram_id;
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from('otp_codes').insert({
    telegram_id: telegramId,
    code: otp,
    purpose: 'reset_password',
    pending_username: usernameLower,
    expires_at: expiresAt,
  });

  if (insertError) {
    return res.status(500).json({ error: 'Gagal membuat kode verifikasi.' });
  }

  try {
    await sendTelegramMessage(
      telegramId,
      `Kode reset password Anda:\n\`${otp}\`\n\nBerlaku 5 menit. Jangan bagikan kode ini ke siapa pun. Abaikan jika Anda tidak meminta ini.`
    );
  } catch {
    // Don't leak Telegram delivery failures either — same generic response.
  }

  return res.status(200).json({ ok: true, message: genericMessage });
}
