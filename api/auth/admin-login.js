import crypto from 'crypto';

// Admin credentials + signing secret must be set as Vercel Environment Variables:
// ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_TOKEN_SECRET
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Lengkapi username dan password.' });
  }

  const validUsername = process.env.ADMIN_USERNAME;
  const validPassword = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_TOKEN_SECRET;

  if (!validUsername || !validPassword || !secret) {
    return res.status(500).json({ error: 'Admin login belum dikonfigurasi di server.' });
  }

  // Constant-time comparison to avoid timing attacks
  const userMatch = timingSafeEqual(username, validUsername);
  const passMatch = timingSafeEqual(password, validPassword);

  if (!userMatch || !passMatch) {
    return res.status(401).json({ error: 'Username atau password admin salah.' });
  }

  // Signed token: payload.signature — no external DB/session needed
  const payload = Buffer.from(JSON.stringify({ role: 'admin', iat: Date.now() })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const token = `${payload}.${signature}`;

  return res.status(200).json({ message: 'Login admin berhasil.', token });
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
