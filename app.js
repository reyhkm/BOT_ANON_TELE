const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const translate = require('@vitalets/google-translate-api');

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

// Struktur data untuk preferensi bahasa per user (berdasarkan chatId)
// Format: { [chatId]: { from: 'id'|'ar', to: 'ar'|'id' } }
let userLanguagePairs = {};

// Utility: Mapping alias bahasa ke kode yang sesuai
function mapLanguage(lang) {
  const mapping = {
    indo: 'id',
    arab: 'ar'
  };
  return mapping[lang.toLowerCase()];
}

// Handler perintah /setlang
// Contoh: /setlang indo arab  => artinya pesan akan diterjemahkan dari bahasa Indonesia ke Arab
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
  // Simpan preferensi pengguna berdasarkan chatId
  userLanguagePairs[chatId] = { from: fromLang, to: toLang };
  bot.sendMessage(
    chatId,
    `Preferensi bahasa berhasil disimpan.\nPesan kamu akan diterjemahkan dari *${parts[1]}* ke *${parts[2]}*.`,
    { parse_mode: 'Markdown' }
  );
}

// Fungsi utama untuk memproses pesan di grup secara otomatis menerjemahkan setiap pesan
async function processGroupMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text && msg.text.trim();

  if (!text) return;

  // Jika perintah /setlang, proses secara khusus tanpa menerjemahkan pesan lainnya
  if (text.startsWith('/setlang')) {
    const parts = text.split(' ');
    handleSetLangCommand(chatId, parts);
    return;
  }

  // Periksa apakah preferensi bahasa sudah diatur untuk chat ini
  const pref = userLanguagePairs[chatId];
  if (!pref) {
    // Jika belum disetting, dapat mengirim pesan peringatan
    // Jika tidak diinginkan, cukup return (tidak mengirim pesan apapun)
    // bot.sendMessage(chatId, 'Kamu belum mengatur preferensi bahasa.\nGunakan perintah: /setlang <asal> <tujuan>\nContoh: /setlang indo arab');
    return;
  }

  try {
    // Terjemahkan setiap pesan otomatis tanpa reply ke pesan asli
    const result = await translate(text, { from: pref.from, to: pref.to });
    bot.sendMessage(chatId, `*Terjemahan:*\n${result.text}`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Error saat menerjemahkan:', err);
    bot.sendMessage(chatId, 'Terjadi kesalahan saat menerjemahkan pesan.');
  }
}

// Endpoint untuk menerima update dari webhook Telegram
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Handler untuk setiap pesan masuk
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
