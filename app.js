// app.js
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

// Hardcode token dan URL webhook (ganti dengan nilai milikmu)
const TOKEN = '7783307198:AAFNOoLG-I-xMsPZMnDSqWXHXFshigXuKxU';
const WEBHOOK_URL = 'https://botanontele-production.up.railway.app';

// Inisialisasi bot dengan mode webhook
const bot = new TelegramBot(TOKEN, { polling: false });

// Set webhook
bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`)
  .then(() => console.log(`Webhook disetel ke ${WEBHOOK_URL}/bot${TOKEN}`))
  .catch(err => console.error('Gagal menyetel webhook:', err));

// Inisialisasi Express
const app = express();
app.use(bodyParser.json());

// Penyimpanan data in-memory
let waitingUsers = []; // [{ chatId }]
let activeChats = {};  // { chatId: partnerChatId }
let userProfiles = {}; // { chatId: { gender: 'male'|'female' } }

// Fungsi untuk menghapus user dari waiting list
function removeWaitingUser(chatId) {
  waitingUsers = waitingUsers.filter(user => user.chatId !== chatId);
}

// Kirim pesan untuk memilih gender dengan inline keyboard
function sendGenderSelection(chatId) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: 'Male', callback_data: 'gender_male' },
        { text: 'Female', callback_data: 'gender_female' }
      ]
    ]
  };
  bot.sendMessage(chatId, 'Pilih gender kamu:', { reply_markup: keyboard });
}

// Kirim menu utama berdasarkan status user (sedang chat atau tidak)
function sendMainMenu(chatId) {
  if (activeChats[chatId]) {
    // Jika sedang dalam sesi chat, tampilkan opsi untuk mengakhiri chat
    const keyboard = {
      inline_keyboard: [
        [{ text: 'Akhiri Chat', callback_data: 'end_chat' }]
      ]
    };
    bot.sendMessage(chatId, 'Kamu sedang dalam sesi chat.', { reply_markup: keyboard });
  } else {
    const keyboard = {
      inline_keyboard: [
        [{ text: 'Cari Partner', callback_data: 'find_partner' }],
        [{ text: 'Ubah Gender', callback_data: 'change_gender' }]
      ]
    };
    bot.sendMessage(chatId, 'Silakan pilih menu:', { reply_markup: keyboard });
  }
}

// Fungsi untuk mencocokkan partner chat
function matchUser(chatId) {
  removeWaitingUser(chatId);
  
  if (waitingUsers.length === 0) {
    waitingUsers.push({ chatId });
    bot.sendMessage(chatId, 'Sedang mencari partner anonim untukmu, tunggu ya...');
    return;
  }
  
  const partner = waitingUsers.shift();
  activeChats[chatId] = partner.chatId;
  activeChats[partner.chatId] = chatId;
  
  bot.sendMessage(chatId, 'Partner ditemukan! Mulai ngobrol secara anonim.');
  bot.sendMessage(partner.chatId, 'Partner ditemukan! Mulai ngobrol secara anonim.');
  sendMainMenu(chatId);
  sendMainMenu(partner.chatId);
}

// Fungsi untuk mengakhiri sesi chat aktif
function endChat(chatId) {
  const partnerId = activeChats[chatId];
  if (partnerId) {
    delete activeChats[chatId];
    delete activeChats[partnerId];
    
    bot.sendMessage(chatId, 'Chat dengan partner telah diakhiri.');
    bot.sendMessage(partnerId, 'Partner telah mengakhiri chat. Kamu bisa cari partner baru.');
    sendMainMenu(chatId);
    sendMainMenu(partnerId);
  } else {
    bot.sendMessage(chatId, 'Kamu belum berada dalam chat aktif.');
  }
}

// Endpoint webhook untuk menerima update dari Telegram
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Handler callback query untuk inline keyboard
bot.on('callback_query', (callbackQuery) => {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  
  if (data.startsWith('gender_')) {
    // Callback untuk pemilihan gender
    const gender = data.split('_')[1];
    userProfiles[chatId] = { gender };
    bot.answerCallbackQuery(callbackQuery.id, { text: `Gender diset ke ${gender}` });
    bot.sendMessage(chatId, `Gender kamu telah diset ke: ${gender}`);
    sendMainMenu(chatId);
    
  } else if (data === 'find_partner') {
    // Pastikan gender sudah diset
    if (!userProfiles[chatId] || !userProfiles[chatId].gender) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Silakan set gender terlebih dahulu.' });
      sendGenderSelection(chatId);
      return;
    }
    // Cegah pencarian dobel
    if (activeChats[chatId]) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Kamu sudah dalam sesi chat.' });
      return;
    }
    if (waitingUsers.find(u => u.chatId === chatId)) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Kamu sudah menunggu partner.' });
      return;
    }
    bot.answerCallbackQuery(callbackQuery.id);
    matchUser(chatId);
    
  } else if (data === 'end_chat') {
    bot.answerCallbackQuery(callbackQuery.id);
    endChat(chatId);
    
  } else if (data === 'change_gender') {
    bot.answerCallbackQuery(callbackQuery.id);
    sendGenderSelection(chatId);
    
  } else {
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Perintah tidak dikenali.' });
  }
});

// Handler untuk pesan teks
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';

  // Jika pesan merupakan perintah (contoh: /start, /help)
  if (text.startsWith('/')) {
    const parts = text.split(' ');
    const command = parts[0].toLowerCase();
    
    if (command === '/start') {
      if (!userProfiles[chatId] || !userProfiles[chatId].gender) {
        bot.sendMessage(chatId, 'Selamat datang! Silakan pilih gender kamu:', {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Male', callback_data: 'gender_male' },
                { text: 'Female', callback_data: 'gender_female' }
              ]
            ]
          }
        });
      } else {
        bot.sendMessage(chatId, 'Selamat datang kembali!', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Cari Partner', callback_data: 'find_partner' }],
              [{ text: 'Ubah Gender', callback_data: 'change_gender' }]
            ]
          }
        });
      }
    } else if (command === '/help') {
      bot.sendMessage(chatId, `Menu bantuan:
- /start: Mulai bot dan tampilkan menu
- /help: Tampilkan pesan bantuan

Gunakan tombol yang tersedia untuk navigasi.`);
    }
    return;
  }
  
  // Jika pesan bukan perintah, teruskan ke partner jika ada
  if (activeChats[chatId]) {
    const partnerId = activeChats[chatId];
    bot.sendMessage(partnerId, text);
  } else {
    bot.sendMessage(chatId, 'Gunakan tombol menu untuk memilih aksi.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Cari Partner', callback_data: 'find_partner' }],
          [{ text: 'Ubah Gender', callback_data: 'change_gender' }]
        ]
      }
    });
  }
});

// Menjalankan server Express
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
