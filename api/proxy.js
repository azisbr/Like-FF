import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './_supabaseAdmin.js';

const REAL_ENDPOINTS = {
  visit: (uid) => `https://api-visit-three.vercel.app/${uid}`,
  info: (uid) => `https://info-ff-akun.vercel.app/info?uid=${uid}`,
  like: (uid) => `https://api-like-dha.vercel.app//like?uid=${uid}`,
};

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export default async function handler(req, res) {
  const { action, uid } = req.method === 'GET' ? req.query : req.body;

  if (!action || !REAL_ENDPOINTS[action]) {
    return res.status(400).json({ error: 'Aksi tidak dikenal.' });
  }
  if (!uid || !/^\d+$/.test(String(uid))) {
    return res.status(400).json({ error: 'UID tidak valid.' });
  }

  // info and visit are open to any logged-out visitor of the page (no limit needed)
  if (action !== 'like') {
    try {
      const r = await fetch(REAL_ENDPOINTS[action](uid));
      const data = await r.json();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(502).json({ error: 'Gagal menghubungi layanan.' });
    }
  }

  // 'like' requires a logged-in user and enforces the 1x/12h limit
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Silakan login untuk menggunakan fitur like.' });
  }

  const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Sesi tidak valid. Silakan login ulang.' });
  }

  const supabase = supabaseAdmin();
  const userId = userData.user.id;

  const { data: lastLike } = await supabase
    .from('like_logs')
    .select('sent_at')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastLike) {
    const elapsed = Date.now() - new Date(lastLike.sent_at).getTime();
    if (elapsed < TWELVE_HOURS_MS) {
      const remainingMs = TWELVE_HOURS_MS - elapsed;
      const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
      const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
      return res.status(429).json({
        error: `Anda sudah mengirim like. Coba lagi dalam ${remainingHours} jam ${remainingMinutes} menit.`,
        remainingMs,
      });
    }
  }

  try {
    const r = await fetch(REAL_ENDPOINTS.like(uid));
    const data = await r.json();

    await supabase.from('like_logs').insert({
      user_id: userId,
      target_uid: String(uid),
    });

    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Gagal menghubungi layanan like.' });
  }
}
