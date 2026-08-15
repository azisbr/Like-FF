import { createClient } from '@supabase/supabase-js';
import { verifyAdminToken } from './_supabaseAdmin.js';

const JWT_ENDPOINT = (uid, password) =>
  `https://new-coral-pi.vercel.app/get_token?uid=${encodeURIComponent(uid)}&password=${encodeURIComponent(password)}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJwt(uid, password) {
  try {
    const r = await fetch(JWT_ENDPOINT(uid, password));
    const data = await r.json();
    if (data.status === 200 && data.token) {
      return { uid, ok: true, token: data.token, region: data.region };
    }
    return { uid, ok: false, error: data.error || data.raw?.error || 'Gagal mendapatkan token.' };
  } catch {
    return { uid, ok: false, error: 'Gagal menghubungi layanan JWT.' };
  }
}

// Parses either a "uid:password" per-line .txt file, or a JSON array of
// objects containing at least uid + password — matching the two example
// file formats the user provided.
function parseBulkInput(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr
        .map((item) => ({ uid: String(item.uid || '').trim(), password: String(item.password || '').trim() }))
        .filter((item) => item.uid && item.password);
    } catch {
      // fall through to line-based parsing below
    }
  }

  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(':');
      if (idx === -1) return null;
      return { uid: line.slice(0, idx).trim(), password: line.slice(idx + 1).trim() };
    })
    .filter((item) => item && item.uid && item.password);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Silakan login untuk menggunakan fitur ini.' });
  }

  const isAdmin = verifyAdminToken(token);
  if (!isAdmin) {
    const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return res.status(401).json({ error: 'Sesi tidak valid. Silakan login ulang.' });
    }
  }

  const { mode, uid, password, bulkText } = req.body || {};

  if (mode === 'bulk') {
    const entries = parseBulkInput(String(bulkText || ''));
    if (!entries.length) {
      return res.status(400).json({ error: 'Tidak ada UID:password yang valid ditemukan di file.' });
    }
    if (entries.length > 60) {
      return res.status(400).json({ error: 'Maksimal 60 akun per request (batasan waktu server). Gunakan antarmuka web untuk file besar — batch otomatis.' });
    }

    const results = [];
    for (let i = 0; i < entries.length; i++) {
      const { uid: u, password: p } = entries[i];
      results.push(await fetchJwt(u, p));
      if (i < entries.length - 1) await sleep(600);
    }

    return res.status(200).json({ results });
  }

  if (!uid || !password) {
    return res.status(400).json({ error: 'UID dan password wajib diisi.' });
  }

  const result = await fetchJwt(String(uid).trim(), String(password).trim());
  return res.status(200).json(result);
}
