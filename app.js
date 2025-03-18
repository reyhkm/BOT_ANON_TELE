// app.js
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

// Hardcode token dan URL webhook (ganti dengan nilai milikmu)
const TOKEN = '7783307198:AAFNOoLG-I-xMsPZMnDSqWXHXFshigXuKxU';
const WEBHOOK_URL = 'https://your-app-url.railway.app';

// Inisialisasi bot dengan mode webhook
const bot = new TelegramBot(TOKEN, { polling: false });

// Set webhook dengan URL yang disediakan
bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`).then(() => {
  console.log(`Webhook telah diset ke ${WEBHOOK_URL}/bot${TOKEN}`);
}).catch(err => {
  console.error('Gagal menyetel webhook:', err);
});

// Inisialisasi Express
const app = express();
app.use(bodyParser.json());

// Struktur data in-memory
let waitingUsers = []; // [{ chatId, gender }]
let activeChats = {};  // { chatId: partnerChatId }
let userProfiles = {}; // { chatId: { gender: 'male'|'female' } }

// Fungsi utilitas untuk menghapus user dari waiting list
function removeWaitingUser(chatId) {
  waitingUsers = waitingUsers.filter(user => user.chatId !== chatId);
}

// Fungsi untuk mencocokkan partner
function matchUser(chatId) {
  // Jika user sudah terdaftar di waiting list, jangan dobel
  removeWaitingUser(chatId);
  
  // Jika tidak ada user yang sedang menunggu, masukkan ke waiting list
  if (waitingUsers.length === 0) {
    waitingUsers.push({ chatId });
    bot.sendMessage(chatId, 'Sedang mencari partner anonim untukmu, tunggu ya...');
    return;
  }
  
  // Ambil partner pertama yang sedang menunggu
  const partner = waitingUsers.shift();
  
  // Buat koneksi chat antara kedua user
  activeChats[chatId] = partner.chatId;
  activeChats[partner.chatId] = chatId;
  
  bot.sendMessage(chatId, 'Partner ditemukan! Mulai ngobrol secara anonim.');
  bot.sendMessage(partner.chatId, 'Partner ditemukan! Mulai ngobrol secara anonim.');
}

// Handler untuk mengakhiri sesi chat aktif
function endChat(chatId) {
  const partnerId = activeChats[chatId];
  if (partnerId) {
    // Hapus kedua user dari activeChats
    delete activeChats[chatId];
    delete activeChats[partnerId];
    
    bot.sendMessage(chatId, 'Chat dengan partner telah diakhiri.');
    bot.sendMessage(partnerId, 'Partner telah mengakhiri chat. Kamu bisa cari partner baru dengan /find.');
  } else {
    bot.sendMessage(chatId, 'Kamu belum berada dalam chat aktif.');
  }
}

// Fungsi untuk menampilkan pesan bantuan
function showHelp(chatId) {
  const helpMessage = 
`Perintah yang tersedia:
/start - Memulai bot dan melihat petunjuk
/setgender [male|female] - Set gender kamu
/find - Cari partner chat anonim
/end - Akhiri sesi chat yang aktif
/help - Tampilkan pesan bantuan`;
  bot.sendMessage(chatId, helpMessage);
}

// Proses update dari webhook Telegram
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Listener untuk semua pesan masuk
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';

  // Jika pesan adalah perintah, proses perintahnya
  if (text.startsWith('/')) {
    const parts = text.split(' ');
    const command = parts[0].toLowerCase();

    switch (command) {
      case '/start':
        bot.sendMessage(chatId, `Selamat datang di Bot Chat Anonim!
Silakan set gender kamu dengan perintah /setgender [male|female]
Kemudian, cari partner dengan /find.
Untuk bantuan, ketik /help`);
        break;

      case '/setgender':
        if (parts.length < 2) {
          bot.sendMessage(chatId, 'Mohon sertakan gender. Contoh: /setgender male');
          return;
        }
        const gender = parts[1].toLowerCase();
        if (gender !== 'male' && gender !== 'female') {
          bot.sendMessage(chatId, 'Gender tidak valid. Hanya menerima "male" atau "female".');
          return;
        }
        userProfiles[chatId] = { gender };
        bot.sendMessage(chatId, `Gender kamu telah diset ke: ${gender}`);
        break;

      case '/find':
        // Validasi: pastikan user sudah mengatur gender
        if (!userProfiles[chatId] || !userProfiles[chatId].gender) {
          bot.sendMessage(chatId, 'Sebelum mencari partner, silakan set gender kamu dengan /setgender [male|female].');
          return;
        }
        // Jika user sudah sedang aktif chat, informasikan
        if (activeChats[chatId]) {
          bot.sendMessage(chatId, 'Kamu sudah sedang berada dalam chat dengan partner.');
          return;
        }
        // Jika user sedang menunggu, jangan dobel
        if (waitingUsers.find(u => u.chatId === chatId)) {
          bot.sendMessage(chatId, 'Kamu sudah dalam antrian mencari partner, tunggu ya...');
          return;
        }
        matchUser(chatId);
        break;

      case '/end':
        // Jika user dalam antrian, keluarkan dari antrian
        removeWaitingUser(chatId);
        // Jika user sedang aktif chat, akhiri sesi
        if (activeChats[chatId]) {
          endChat(chatId);
        } else {
          bot.sendMessage(chatId, 'Kamu tidak sedang dalam sesi chat.');
        }
        break;

      case '/help':
        showHelp(chatId);
        break;

      default:
        bot.sendMessage(chatId, 'Perintah tidak dikenali. Ketik /help untuk daftar perintah.');
        break;
    }
  } else {
    // Jika pesan bukan perintah, cek apakah user sedang dalam chat aktif
    if (activeChats[chatId]) {
      const partnerId = activeChats[chatId];
      // Teruskan pesan ke partner
      bot.sendMessage(partnerId, text);
    } else {
      bot.sendMessage(chatId, 'Kamu belum berada dalam chat aktif. Gunakan /find untuk mencari partner anonim.');
    }
  }
});

// Menjalankan server Express
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
