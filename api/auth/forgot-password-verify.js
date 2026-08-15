import { supabaseAdmin, usernameToInternalEmail } from '../_supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { username, code, newPassword } = req.body || {};
  if (!username || !code || !newPassword) {
    return res.status(400).json({ error: 'Lengkapi semua kolom.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
  }

  const supabase = supabaseAdmin();
  const usernameLower = String(username).toLowerCase();

  const { data: otpRow, error: otpError } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('pending_username', usernameLower)
    .eq('purpose', 'reset_password')
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('username', usernameLower)
    .maybeSingle();

  if (!profile) {
    return res.status(400).json({ error: 'Akun tidak ditemukan.' });
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(profile.user_id, {
    password: newPassword,
  });

  if (updateError) {
    return res.status(500).json({ error: 'Gagal mengubah password: ' + updateError.message });
  }

  await supabase.from('otp_codes').delete().eq('id', otpRow.id);

  return res.status(200).json({ ok: true, message: 'Password berhasil diubah. Silakan masuk dengan password baru.' });
}
