// app.js
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

// Hardcode token dan URL webhook (ganti dengan nilai milikmu)
const TOKEN = '7783307198:AAFNOoLG-I-xMsPZMnDSqWXHXFshigXuKxU';
const WEBHOOK_URL = 'https://botanontele-production.up.railway.app';

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

// Inline Keyboard Main Menu
const mainMenuKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: 'Set Gender', callback_data: 'menu_set_gender' },
        { text: 'Cari Partner', callback_data: 'menu_find' }
      ],
      [
        { text: 'End Chat', callback_data: 'menu_end' },
        { text: 'Help', callback_data: 'menu_help' }
      ]
    ]
  }
};

// Inline Keyboard untuk pemilihan Gender
const genderKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: 'Male', callback_data: 'set_gender_male' },
        { text: 'Female', callback_data: 'set_gender_female' }
      ]
    ]
  }
};

// Fungsi untuk mengirim main menu ke user
function sendMainMenu(chatId) {
  const menuMessage =
`*AnonChat Bot*
Selamat datang di Chat Bot Anonim!

Kamu bisa menggunakan tombol di bawah ini atau mengetik perintah secara manual (misalnya: /setgender, /find, /end, /help).

Pilih aksi yang kamu inginkan:`;
  bot.sendMessage(chatId, menuMessage, { parse_mode: 'Markdown', ...mainMenuKeyboard });
}

// Fungsi utilitas untuk menghapus user dari waiting list
function removeWaitingUser(chatId) {
  waitingUsers = waitingUsers.filter(user => user.chatId !== chatId);
}

// Fungsi untuk mencocokkan partner
function matchUser(chatId) {
  // Pastikan user tidak dobel di antrian
  removeWaitingUser(chatId);

  // Jika tidak ada user yang menunggu, masukkan ke antrian
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
    bot.sendMessage(partnerId, 'Partner telah mengakhiri chat. Kamu bisa cari partner baru dengan /find atau melalui main menu.');
  } else {
    bot.sendMessage(chatId, 'Kamu belum berada dalam chat aktif.');
  }
}

// Fungsi untuk menampilkan pesan bantuan
function showHelp(chatId) {
  const helpMessage =
`*Help - Panduan Penggunaan AnonChat Bot*
Berikut perintah yang dapat kamu gunakan:

• /start - Memulai bot dan menampilkan main menu  
• /setgender [male|female] - Set gender kamu (atau klik tombol "Set Gender")  
• /find - Cari partner chat anonim (atau klik tombol "Cari Partner")  
• /end - Akhiri sesi chat yang aktif (atau klik tombol "End Chat")  
• /help - Tampilkan pesan bantuan

Kamu juga bisa menggunakan tombol di main menu untuk navigasi.`;
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
}

// Endpoint untuk menerima update dari webhook Telegram
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Handler untuk pesan masuk melalui perintah / pesan teks
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';

  // Jika pesan adalah perintah
  if (text.startsWith('/')) {
    const parts = text.split(' ');
    const command = parts[0].toLowerCase();

    switch (command) {
      case '/start':
        sendMainMenu(chatId);
        break;

      case '/setgender':
        // Jika gender diberikan sebagai parameter
        if (parts.length >= 2) {
          const gender = parts[1].toLowerCase();
          if (gender !== 'male' && gender !== 'female') {
            bot.sendMessage(chatId, 'Gender tidak valid. Hanya menerima "male" atau "female".');
            return;
          }
          userProfiles[chatId] = { gender };
          bot.sendMessage(chatId, `Gender kamu telah diset ke: ${gender}`);
          sendMainMenu(chatId);
        } else {
          // Jika tidak, tampilkan pilihan gender
          bot.sendMessage(chatId, 'Pilih gender kamu:', genderKeyboard);
        }
        break;

      case '/find':
        if (!userProfiles[chatId] || !userProfiles[chatId].gender) {
          bot.sendMessage(chatId, 'Sebelum mencari partner, set gender kamu terlebih dahulu dengan /setgender atau melalui main menu.');
          return;
        }
        if (activeChats[chatId]) {
          bot.sendMessage(chatId, 'Kamu sudah sedang berada dalam chat dengan partner.');
          return;
        }
        if (waitingUsers.find(u => u.chatId === chatId)) {
          bot.sendMessage(chatId, 'Kamu sudah dalam antrian mencari partner, tunggu ya...');
          return;
        }
        matchUser(chatId);
        break;

      case '/end':
        removeWaitingUser(chatId);
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
        bot.sendMessage(chatId, 'Perintah tidak dikenali. Gunakan /help untuk panduan penggunaan.');
        break;
    }
  } else {
    // Jika pesan bukan perintah, cek apakah user sedang dalam chat aktif
    if (activeChats[chatId]) {
      const partnerId = activeChats[chatId];
      bot.sendMessage(partnerId, text);
    } else {
      bot.sendMessage(chatId, 'Kamu belum berada dalam chat aktif. Gunakan /find atau pilih "Cari Partner" dari main menu.');
    }
  }
});

// Handler untuk inline keyboard (callback_query)
bot.on('callback_query', (callbackQuery) => {
  const action = callbackQuery.data;
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;

  if (action === 'menu_set_gender') {
    bot.answerCallbackQuery(callbackQuery.id);
    // Tampilkan pilihan gender
    bot.sendMessage(chatId, 'Pilih gender kamu:', genderKeyboard);
  } else if (action === 'set_gender_male') {
    userProfiles[chatId] = { gender: 'male' };
    bot.answerCallbackQuery(callbackQuery.id, { text: "Gender diset ke male" });
    bot.sendMessage(chatId, "Gender kamu telah diset ke male.");
    sendMainMenu(chatId);
  } else if (action === 'set_gender_female') {
    userProfiles[chatId] = { gender: 'female' };
    bot.answerCallbackQuery(callbackQuery.id, { text: "Gender diset ke female" });
    bot.sendMessage(chatId, "Gender kamu telah diset ke female.");
    sendMainMenu(chatId);
  } else if (action === 'menu_find') {
    if (!userProfiles[chatId] || !userProfiles[chatId].gender) {
      bot.answerCallbackQuery(callbackQuery.id, { text: "Set gender dulu ya!" });
      bot.sendMessage(chatId, 'Sebelum mencari partner, set gender kamu terlebih dahulu dengan /setgender atau klik "Set Gender".');
    } else if (activeChats[chatId]) {
      bot.answerCallbackQuery(callbackQuery.id, { text: "Kamu sudah sedang chat." });
      bot.sendMessage(chatId, 'Kamu sudah sedang berada dalam chat dengan partner.');
    } else if (waitingUsers.find(u => u.chatId === chatId)) {
      bot.answerCallbackQuery(callbackQuery.id, { text: "Sedang menunggu partner." });
      bot.sendMessage(chatId, 'Kamu sudah dalam antrian mencari partner, tunggu ya...');
    } else {
      bot.answerCallbackQuery(callbackQuery.id);
      matchUser(chatId);
    }
  } else if (action === 'menu_end') {
    removeWaitingUser(chatId);
    if (activeChats[chatId]) {
      bot.answerCallbackQuery(callbackQuery.id);
      endChat(chatId);
    } else {
      bot.answerCallbackQuery(callbackQuery.id, { text: "Tidak ada sesi chat aktif." });
      bot.sendMessage(chatId, 'Kamu tidak sedang dalam sesi chat.');
    }
  } else if (action === 'menu_help') {
    bot.answerCallbackQuery(callbackQuery.id);
    showHelp(chatId);
  }
});

// Menjalankan server Express
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
