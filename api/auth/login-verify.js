import { supabaseAdmin, telegramIdToInternalEmail } from '../_supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { telegramId, code, password } = req.body || {};
  if (!telegramId || !code || !password) {
    return res.status(400).json({ error: 'Data tidak lengkap.' });
  }

  const supabase = supabaseAdmin();

  const { data: otpRow, error: otpError } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('telegram_id', String(telegramId))
    .eq('purpose', 'login')
    .eq('consumed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpError || !otpRow) {
    return res.status(400).json({ error: 'Kode tidak ditemukan. Silakan minta kode baru.' });
  }
  if (new Date(otpRow.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Kode sudah kedaluwarsa.' });
  }
  if (otpRow.code !== String(code)) {
    return res.status(400).json({ error: 'Kode salah.' });
  }

  await supabase.from('otp_codes').update({ consumed: true }).eq('id', otpRow.id);

  // Re-verify password + issue a real session token via the standard sign-in call.
  const { createClient } = await import('@supabase/supabase-js');
  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const email = telegramIdToInternalEmail(telegramId);
  const { data: sessionData, error: signInError } = await anonClient.auth.signInWithPassword({ email, password });

  if (signInError) {
    return res.status(401).json({ error: 'Sesi login tidak valid, silakan ulangi.' });
  }

  return res.status(200).json({
    ok: true,
    session: {
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
    },
  });
}
