const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const translate = require('@vitalets/google-translate-api');

// Konfigurasi token dan webhook
const TOKEN = '7783307198:AAFNOoLG-I-xMsPZMnDSqWXHXFshigXuKxU';
const WEBHOOK_URL = 'https://botanontele-production.up.railway.app';
const BOT_MENTION = '@percakapanseru_bot'; // Ganti dengan username bot kamu

// Inisialisasi bot dengan webhook
const bot = new TelegramBot(TOKEN, { polling: false });
bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`)
  .then(() => console.log(`Webhook telah diset ke ${WEBHOOK_URL}/bot${TOKEN}`))
  .catch(err => console.error('Gagal menyetel webhook:', err));

// Inisialisasi Express
const app = express();
app.use(bodyParser.json());

// Struktur data untuk preferensi bahasa per user
// Format: { [chatId]: { from: 'id'|'ar', to: 'ar'|'id' } }
let userLanguagePairs = {};

// Utility: Mapping bahasa
function mapLanguage(lang) {
  const mapping = {
    indo: 'id',
    arab: 'ar'
  };
  return mapping[lang.toLowerCase()];
}

// Handler perintah /setlang
// Contoh: /setlang indo arab   (artinya terjemahkan dari Bahasa Indonesia ke Arab)
function handleSetLangCommand(chatId, parts) {
  if (parts.length < 3) {
    bot.sendMessage(chatId, 'Format salah. Gunakan: /setlang <asal> <tujuan>\nContoh: /setlang indo arab');
    return;
  }
  const fromLang = mapLanguage(parts[1]);
  const toLang = mapLanguage(parts[2]);
  if (!fromLang || !toLang) {
    bot.sendMessage(chatId, 'Bahasa yang didukung hanya: indo dan arab.');
    return;
  }
  if (fromLang === toLang) {
    bot.sendMessage(chatId, 'Bahasa asal dan tujuan tidak boleh sama.');
    return;
  }
  userLanguagePairs[chatId] = { from: fromLang, to: toLang };
  bot.sendMessage(chatId, `Preferensi bahasa berhasil disimpan.\nPesan kamu akan diterjemahkan dari *${parts[1]}* ke *${parts[2]}*.`, { parse_mode: 'Markdown' });
}

// Fungsi utama untuk memproses pesan grup
async function processGroupMessage(msg) {
  const chatId = msg.chat.id;
  const originalMessageId = msg.message_id;
  const text = msg.text && msg.text.trim();

  // Pastikan ada teks
  if (!text) return;

  // Jika perintah /setlang, proses saja
  if (text.startsWith('/setlang')) {
    const parts = text.split(' ');
    handleSetLangCommand(chatId, parts);
    return;
  }

  // Jika perintah lain, bisa ditambahkan atau diabaikan
  if (text.startsWith('/')) {
    bot.sendMessage(chatId, 'Perintah tidak dikenali. Gunakan /setlang untuk mengatur preferensi bahasa.');
    return;
  }

  // Proses auto translate bila pesan menyebut bot
  if (text.includes(BOT_MENTION)) {
    // Hapus mention bot dari teks
    const cleanedText = text.replace(BOT_MENTION, '').trim();
    if (!cleanedText) {
      bot.sendMessage(chatId, 'Tidak ada teks untuk diterjemahkan.', { reply_to_message_id: originalMessageId });
      return;
    }

    // Cek apakah preferensi bahasa sudah diatur
    const pref = userLanguagePairs[chatId];
    if (!pref) {
      bot.sendMessage(chatId, 'Kamu belum mengatur preferensi bahasa.\nGunakan perintah: /setlang <asal> <tujuan>\nContoh: /setlang indo arab', { reply_to_message_id: originalMessageId });
      return;
    }

    // Lakukan terjemahan
    try {
      const result = await translate(cleanedText, { from: pref.from, to: pref.to });
      bot.sendMessage(chatId, `*Terjemahan:*\n${result.text}`, { parse_mode: 'Markdown', reply_to_message_id: originalMessageId });
    } catch (err) {
      console.error('Error saat menerjemahkan:', err);
      bot.sendMessage(chatId, 'Terjadi kesalahan saat menerjemahkan pesan.', { reply_to_message_id: originalMessageId });
    }
  }
}

// Endpoint untuk menerima update dari webhook Telegram
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Handler pesan masuk
bot.on('message', (msg) => {
  // Proses hanya pesan teks
  if (msg.text) {
    processGroupMessage(msg);
  }
});

// Menjalankan server Express
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
