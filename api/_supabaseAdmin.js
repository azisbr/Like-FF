import { createClient } from '@supabase/supabase-js';

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
// The user never sees or uses this — they only ever type their Telegram ID.
export function telegramIdToInternalEmail(telegramId) {
  return `tg_${telegramId}@users.internal`;
}

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || 'Gagal mengirim pesan Telegram. Pastikan Anda sudah /start bot terlebih dahulu.');
  }
  return data;
}
