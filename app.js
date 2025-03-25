const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const translate = require('google-translate-api'); // Menggunakan google-translate-api versi 2.3.0

// Konfigurasi token dan webhook
const TOKEN = '7783307198:AAFNOoLG-I-xMsPZMnDSqWXHXFshigXuKxU';
const WEBHOOK_URL = 'https://botanontele-production.up.railway.app';

const bot = new TelegramBot(TOKEN, { polling: false });
bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`)
  .then(() => console.log(`Webhook telah diset ke ${WEBHOOK_URL}/bot${TOKEN}`))
  .catch(err => console.error('Gagal menyetel webhook:', err));

const app = express();
app.use(bodyParser.json());

// Struktur data untuk menyimpan preferensi bahasa per user
// Format: { [chatId]: { from: 'id'|'ar', to: 'ar'|'id' } }
let userLanguagePairs = {};

// Fungsi utilitas untuk memetakan alias bahasa ke kode yang didukung
function mapLanguage(lang) {
  const mapping = {
    indo: 'id',
    arab: 'ar'
  };
  return mapping[lang.toLowerCase()];
}

// Handler untuk perintah /setlang
// Contoh: /setlang indo arab (artinya terjemahkan dari Bahasa Indonesia ke Arab)
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
  bot.sendMessage(
    chatId,
    `Preferensi bahasa berhasil disimpan.\nPesan kamu akan diterjemahkan dari *${parts[1]}* ke *${parts[2]}*.`,
    { parse_mode: 'Markdown' }
  );
}

// Fungsi utama untuk memproses pesan teks
function processGroupMessage(msg) {
  const chatId = msg.chat.id;
  const originalMessageId = msg.message_id;
  const text = msg.text && msg.text.trim();
  if (!text) return;

  // Proses perintah /setlang
  if (text.startsWith('/setlang')) {
    const parts = text.split(' ');
    handleSetLangCommand(chatId, parts);
    return;
  }

  // Abaikan pesan yang diawali dengan "/" selain /setlang
  if (text.startsWith('/')) return;

  // Jika pengguna sudah mengatur preferensi bahasa, terjemahkan pesan secara otomatis
  const pref = userLanguagePairs[chatId];
  if (pref) {
    translate(text, { from: pref.from, to: pref.to })
      .then(res => {
        // Hasil terjemahan utama
        // Jika ada informasi autocorrect, bisa diakses melalui:
        // res.from.text.autoCorrected, res.from.text.value, res.from.text.didYouMean
        bot.sendMessage(
          chatId,
          `*Terjemahan:*\n${res.text}`,
          { parse_mode: 'Markdown', reply_to_message_id: originalMessageId }
        );
      })
      .catch(err => {
        console.error('Error saat menerjemahkan:', err);
        bot.sendMessage(chatId, 'Terjadi kesalahan saat menerjemahkan pesan.', { reply_to_message_id: originalMessageId });
      });
  }
}

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

bot.on('message', (msg) => {
  if (msg.text) {
    processGroupMessage(msg);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
