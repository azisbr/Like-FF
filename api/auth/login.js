import { createClient } from '@supabase/supabase-js';
import { usernameToInternalEmail } from '../_supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }

  const email = usernameToInternalEmail(username);

  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data, error: signInError } = await anonClient.auth.signInWithPassword({ email, password });

  if (signInError || !data?.session) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }

  return res.status(200).json({
    message: 'Login berhasil.',
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
    displayName: data.user?.user_metadata?.display_name || username,
  });
}
