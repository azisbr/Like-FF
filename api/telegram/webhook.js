import { supabaseAdmin, sendTelegramMessage } from '../_supabaseAdmin.js';

// Telegram calls this URL every time someone messages the bot.
// We only care about /start here — it confirms the user's chat_id is reachable.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true }); // Telegram expects 200 even on noop

  const update = req.body || {};
  const message = update.message;

  if (!message || !message.chat || !message.chat.id) {
    return res.status(200).json({ ok: true });
  }

  const chatId = String(message.chat.id);
  const text = (message.text || '').trim();

  const supabase = supabaseAdmin();

  // Track that this chat_id has started the bot and can receive messages.
  await supabase
    .from('telegram_contacts')
    .upsert({ telegram_id: chatId, started_at: new Date().toISOString() }, { onConflict: 'telegram_id' });

  if (text === '/start') {
    try {
      await sendTelegramMessage(
        chatId,
        `Bot siap. Telegram ID Anda:\n\`${chatId}\`\n\nGunakan ID ini saat mendaftar atau masuk di web.`
      );
    } catch (err) {
      // Non-fatal — Telegram still gets a 200 either way
    }
  }

  return res.status(200).json({ ok: true });
}
