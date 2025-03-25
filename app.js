const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const translate = require('@iamtraction/google-translate');

// Konfigurasi token dan webhook
const TOKEN = '7783307198:AAFNOoLG-I-xMsPZMnDSqWXHXFshigXuKxU';
const WEBHOOK_URL = 'https://botanontele-production.up.railway.app';

// Inisialisasi bot dengan webhook
const bot = new TelegramBot(TOKEN, { polling: false });
bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`)
  .then(() => console.log(`Webhook telah diset ke ${WEBHOOK_URL}/bot${TOKEN}`))
  .catch(err => console.error('Gagal menyetel webhook:', err));

// Inisialisasi Express
const app = express();
app.use(bodyParser.json());

// Struktur data untuk menyimpan preferensi bahasa per user
// Format: { [chatId]: { from: 'id'|'ar', to: 'ar'|'id' } }
let userLanguagePairs = {};

// Utility: Mapping alias bahasa ke kode ISO 639-1
function mapLanguage(lang) {
  const mapping = {
    indo: 'id',
    arab: 'ar'
  };
  return mapping[lang.toLowerCase()];
}

// Handler untuk perintah /setlang
// Contoh: /setlang indo arab  (menerjemahkan dari Bahasa Indonesia ke Arab)
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

// Fungsi utama untuk memproses pesan teks dari grup
async function processGroupMessage(msg) {
  const chatId = msg.chat.id;
  const originalMessageId = msg.message_id;
  const text = msg.text && msg.text.trim();

  if (!text) return;

  // Jika pesan merupakan perintah /setlang, proses terlebih dahulu
  if (text.startsWith('/setlang')) {
    const parts = text.split(' ');
    handleSetLangCommand(chatId, parts);
    return;
  }

  // Opsional: Abaikan pesan yang merupakan perintah lainnya (diawali dengan "/")
  if (text.startsWith('/')) return;

  // Jika pengguna sudah mengatur preferensi bahasa, langsung terjemahkan pesan
  const pref = userLanguagePairs[chatId];
  if (pref) {
    try {
      // Library @iamtraction/google-translate secara otomatis menangani auto correct dan spelling correction
      const result = await translate(text, { from: pref.from, to: pref.to });
      
      // Contoh: Jika ingin menampilkan informasi auto correct, kamu bisa mengecek properti berikut:
      // result.from.autoCorrected -> boolean
      // result.from.text.value -> string yang telah dikoreksi (jika tersedia)
      
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
  if (msg.text) {
    processGroupMessage(msg);
  }
});

// Menjalankan server Express
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
