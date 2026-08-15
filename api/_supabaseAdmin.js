import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Server-only client using the secret/service_role key.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as Vercel Environment Variables.
// This file must NEVER be imported by front-end code.
export function supabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Internal dummy email format used since Supabase Auth requires an email.
// The user never sees or uses this — they only ever type their username.
export function usernameToInternalEmail(username) {
  return `user_${String(username).toLowerCase()}@users.internal`;
}

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || 'Gagal mengirim pesan Telegram. Pastikan Anda sudah /start bot terlebih dahulu.');
  }
  return data;
}

// Verifies an admin token issued by /api/auth/admin-login.js
// Returns true only if the signature matches ADMIN_TOKEN_SECRET.
export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!secret) return false;

  const [payload, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');

  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

