import { supabaseAdmin, usernameToInternalEmail } from '../_supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { telegramId, code } = req.body || {};
  if (!telegramId || !code) {
    return res.status(400).json({ error: 'Telegram ID dan kode wajib diisi.' });
  }

  const supabase = supabaseAdmin();

  const { data: otpRow, error: otpError } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('telegram_id', String(telegramId))
    .eq('purpose', 'register')
    .eq('consumed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpError || !otpRow) {
    return res.status(400).json({ error: 'Kode tidak ditemukan. Silakan minta kode baru.' });
  }
  if (new Date(otpRow.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Kode sudah kedaluwarsa. Silakan minta kode baru.' });
  }
  if (otpRow.code !== String(code)) {
    return res.status(400).json({ error: 'Kode salah.' });
  }

  // Mark OTP as consumed first to prevent replay
  await supabase.from('otp_codes').update({ consumed: true }).eq('id', otpRow.id);

  if (!otpRow.pending_plain_password || !otpRow.pending_username) {
    return res.status(500).json({ error: 'Sesi pendaftaran tidak valid. Silakan daftar ulang.' });
  }

  const email = usernameToInternalEmail(otpRow.pending_username);

  // Create the actual auth user now that OTP is verified, using the password
  // the user chose during registration. Supabase Auth stores/hashes it internally.
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: otpRow.pending_plain_password,
    email_confirm: true,
    user_metadata: {
      username: otpRow.pending_username,
      telegram_id: String(telegramId),
      display_name: otpRow.pending_display_name,
    },
  });

  if (createError) {
    return res.status(500).json({ error: 'Gagal membuat akun: ' + createError.message });
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    user_id: created.user.id,
    username: otpRow.pending_username,
    telegram_id: String(telegramId),
    display_name: otpRow.pending_display_name,
  });

  if (profileError) {
    return res.status(500).json({ error: 'Gagal menyimpan profil: ' + profileError.message });
  }

  // Remove the OTP row now — it briefly held the user's plain password and is no longer needed.
  await supabase.from('otp_codes').delete().eq('id', otpRow.id);

  return res.status(200).json({ ok: true, message: 'Akun berhasil dibuat. Silakan login dengan username Anda.' });
}
