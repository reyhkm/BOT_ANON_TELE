const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const translate = require('@vitalets/google-translate-api'); // Pastikan paket ini sudah terinstall

// Hardcode token dan URL webhook (ganti dengan nilai milikmu)
const TOKEN = '7783307198:AAFNOoLG-I-xMsPZMnDSqWXHXFshigXuKxU';
const WEBHOOK_URL = 'https://botanontele-production.up.railway.app';

// Set nama user bot (sesuaikan dengan username bot-mu)
const BOT_MENTION = '@percakapanseru_bot ';

// Inisialisasi bot dengan mode webhook
const bot = new TelegramBot(TOKEN, { polling: false });
bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`)
  .then(() => console.log(`Webhook telah diset ke ${WEBHOOK_URL}/bot${TOKEN}`))
  .catch(err => console.error('Gagal menyetel webhook:', err));

// Inisialisasi Express
const app = express();
app.use(bodyParser.json());

// Struktur data untuk menyimpan preferensi bahasa setiap user
// Format: { [chatId]: { from: 'id'|'ar', to: 'ar'|'id' } }
let userLanguagePairs = {};

// Fungsi untuk mengubah alias bahasa menjadi kode (hanya mendukung indo & arab)
function mapLanguage(lang) {
  const mapping = {
    indo: 'id',
    arab: 'ar'
  };
  return mapping[lang.toLowerCase()];
}

// Fungsi untuk meng-handle perintah /setlang
// Contoh: /setlang indo arab   (berarti dari bahasa Indonesia ke Arab)
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

// Fungsi untuk menangani terjemahan pesan
async function handleTranslation(chatId, originalText) {
  const pref = userLanguagePairs[chatId];
  if (!pref) {
    bot.sendMessage(chatId, 'Kamu belum mengatur preferensi bahasa.\nGunakan perintah: /setlang <asal> <tujuan>\nContoh: /setlang indo arab');
    return;
  }

  try {
    const result = await translate(originalText, { from: pref.from, to: pref.to });
    // Kirim hasil terjemahan dengan reply ke pesan asli
    bot.sendMessage(chatId, `*Terjemahan:*\n${result.text}`, { parse_mode: 'Markdown', reply_to_message_id: originalMessageId });
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

// Handler untuk pesan masuk
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  // Hanya proses pesan teks
  if (!msg.text) return;

  const text = msg.text.trim();
  const parts = text.split(' ');

  // Perintah /setlang untuk mengatur preferensi bahasa
  if (text.startsWith('/setlang')) {
    handleSetLangCommand(chatId, parts);
    return;
  }

  // Jika pesan berupa perintah lain, abaikan (atau bisa tambahkan perintah tambahan)
  if (text.startsWith('/')) {
    bot.sendMessage(chatId, 'Perintah tidak dikenali. Gunakan /setlang untuk mengatur bahasa.');
    return;
  }

  // Cek apakah pesan mengandung tag ke bot
  if (text.includes(BOT_MENTION)) {
    // Hapus mention dari pesan (opsional: agar tidak ikut diterjemahkan)
    const cleanedText = text.replace(BOT_MENTION, '').trim();
    if (!cleanedText) {
      bot.sendMessage(chatId, 'Tidak ada teks untuk diterjemahkan.');
      return;
    }

    // Simpan message_id asli jika ingin menggunakan reply (misalnya jika ingin reply ke pesan tersebut)
    const originalMessageId = msg.message_id;

    // Lakukan terjemahan dan kirim hasilnya
    (async () => {
      try {
        const pref = userLanguagePairs[chatId];
        if (!pref) {
          bot.sendMessage(chatId, 'Kamu belum mengatur preferensi bahasa. Gunakan /setlang <asal> <tujuan> untuk mengaturnya.');
          return;
        }
        const result = await translate(cleanedText, { from: pref.from, to: pref.to });
        bot.sendMessage(chatId, `*Terjemahan:*\n${result.text}`, { parse_mode: 'Markdown', reply_to_message_id: originalMessageId });
      } catch (err) {
        console.error('Error saat menerjemahkan:', err);
        bot.sendMessage(chatId, 'Terjadi kesalahan saat menerjemahkan pesan.');
      }
    })();
  }
});

// Menjalankan server Express
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
