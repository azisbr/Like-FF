import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin, telegramIdToInternalEmail, generateOtp, sendTelegramMessage } from '../_supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { telegramId, password } = req.body || {};
  if (!telegramId || !password) {
    return res.status(400).json({ error: 'Telegram ID dan password wajib diisi.' });
  }

  const email = telegramIdToInternalEmail(telegramId);

  // Verify the password using a plain (anon-key) client's sign-in — this
  // never creates a lasting session here, we just use it to check credentials.
  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { error: signInError } = await anonClient.auth.signInWithPassword({ email, password });

  if (signInError) {
    return res.status(401).json({ error: 'Telegram ID atau password salah.' });
  }

  const supabase = supabaseAdmin();
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await supabase.from('otp_codes').insert({
    telegram_id: String(telegramId),
    code: otp,
    purpose: 'login',
    expires_at: expiresAt,
  });

  try {
    await sendTelegramMessage(
      telegramId,
      `Kode login Anda: ${otp}\n\nBerlaku 5 menit. Jangan bagikan kode ini ke siapa pun.`
    );
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  return res.status(200).json({ ok: true, message: 'Kode OTP telah dikirim ke Telegram Anda.' });
}
