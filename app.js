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
bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`)
  .then(() => console.log(`Webhook telah diset ke ${WEBHOOK_URL}/bot${TOKEN}`))
  .catch(err => console.error('Gagal menyetel webhook:', err));

// Inisialisasi Express
const app = express();
app.use(bodyParser.json());

// Struktur data in-memory
let waitingUsers = []; // [{ chatId }]
let activeChats = {};  // { chatId: partnerChatId }
let userProfiles = {}; // { chatId: { gender: 'male'|'female' } }
let replyMapping = {}; // { "<chatId>:<messageId>": { chatId, messageId } }

// Helper untuk menyimpan mapping reply dua arah
function storeReplyMapping(fromChatId, fromMessageId, toChatId, toMessageId) {
  replyMapping[`${fromChatId}:${fromMessageId}`] = { chatId: toChatId, messageId: toMessageId };
  replyMapping[`${toChatId}:${toMessageId}`] = { chatId: fromChatId, messageId: fromMessageId };
}

// Fungsi untuk meneruskan pesan (teks & media) dengan dukungan reply
function forwardMessage(chatId, partnerId, msg) {
  // Cek apakah pesan merupakan reply dan coba temukan mapping
  let replyToOption = {};
  if (msg.reply_to_message && replyMapping[`${chatId}:${msg.reply_to_message.message_id}`]) {
    const mapping = replyMapping[`${chatId}:${msg.reply_to_message.message_id}`];
    if (mapping && mapping.chatId === partnerId) {
      replyToOption.reply_to_message_id = mapping.messageId;
    }
  }
  
  if (msg.text) {
    bot.sendMessage(partnerId, msg.text, replyToOption).then((sentMsg) => {
      storeReplyMapping(chatId, msg.message_id, partnerId, sentMsg.message_id);
    });
  } else if (msg.photo) {
    // Ambil foto dengan resolusi tertinggi
    const photoArray = msg.photo;
    const fileId = photoArray[photoArray.length - 1].file_id;
    bot.sendPhoto(partnerId, fileId, { caption: msg.caption || '', ...replyToOption }).then((sentMsg) => {
      storeReplyMapping(chatId, msg.message_id, partnerId, sentMsg.message_id);
    });
  } else if (msg.video) {
    bot.sendVideo(partnerId, msg.video.file_id, { caption: msg.caption || '', ...replyToOption }).then((sentMsg) => {
      storeReplyMapping(chatId, msg.message_id, partnerId, sentMsg.message_id);
    });
  } else if (msg.voice) {
    bot.sendVoice(partnerId, msg.voice.file_id, replyToOption).then((sentMsg) => {
      storeReplyMapping(chatId, msg.message_id, partnerId, sentMsg.message_id);
    });
  } else if (msg.audio) {
    bot.sendAudio(partnerId, msg.audio.file_id, { caption: msg.caption || '', ...replyToOption }).then((sentMsg) => {
      storeReplyMapping(chatId, msg.message_id, partnerId, sentMsg.message_id);
    });
  } else if (msg.animation) {
    bot.sendAnimation(partnerId, msg.animation.file_id, { caption: msg.caption || '', ...replyToOption }).then((sentMsg) => {
      storeReplyMapping(chatId, msg.message_id, partnerId, sentMsg.message_id);
    });
  } else if (msg.video_note) {
    bot.sendVideoNote(partnerId, msg.video_note.file_id, replyToOption).then((sentMsg) => {
      storeReplyMapping(chatId, msg.message_id, partnerId, sentMsg.message_id);
    });
  } else if (msg.document) {
    bot.sendDocument(partnerId, msg.document.file_id, { caption: msg.caption || '', ...replyToOption }).then((sentMsg) => {
      storeReplyMapping(chatId, msg.message_id, partnerId, sentMsg.message_id);
    });
  } else if (msg.sticker) {
    bot.sendSticker(partnerId, msg.sticker.file_id, replyToOption).then((sentMsg) => {
      storeReplyMapping(chatId, msg.message_id, partnerId, sentMsg.message_id);
    });
  } else {
    bot.sendMessage(partnerId, 'Tipe pesan ini tidak didukung untuk diteruskan.', replyToOption);
  }
}

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

// Fungsi untuk mengirim menu dinamis beserta info aktif user
function sendDynamicMenu(chatId) {
  // Hitung statistik pengguna aktif
  const activeChatCount = Object.keys(activeChats).length / 2;
  const waitingCount = waitingUsers.length;
  const totalActive = activeChatCount + waitingCount;
  const activeInfo = `Pengguna aktif: *${totalActive}* (Chat: *${activeChatCount}*, Antrian: *${waitingCount}*)\n\n`;

  // Jika gender belum diset, tampilkan pesan dan menu Set Gender & Help
  if (!userProfiles[chatId] || !userProfiles[chatId].gender) {
    const message = 
activeInfo +
`Selamat datang di *RuangRahasia*
Platform chat anonim dari *hikam* :)

Silahkan atur gender kamu dengan klik tombol *Set Gender*.

Setelah itu, kamu dapat:
• *Cari Partner* untuk obrolan anonim.
• *Next* untuk ganti partner.
• *End Chat* untuk mengakhiri sesi.
• *Help* untuk panduan.`;
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Set Gender', callback_data: 'menu_set_gender' }],
          [{ text: 'Help', callback_data: 'menu_help' }]
        ]
      }
    };
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...keyboard });
    return;
  }

  // Jika gender sudah diset dan user tidak sedang chat atau menunggu
  if (!activeChats[chatId] && !waitingUsers.find(u => u.chatId === chatId)) {
    const message = 
activeInfo +
`Gender kamu: *${userProfiles[chatId].gender}*.

Pilih aksi:
• *Cari Partner*
• *Set Gender* (ubah)
• *Help*`;
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Cari Partner', callback_data: 'menu_find' }, { text: 'Set Gender', callback_data: 'menu_set_gender' }],
          [{ text: 'Help', callback_data: 'menu_help' }]
        ]
      }
    };
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...keyboard });
    return;
  }

  // Jika user sedang dalam sesi chat aktif
  if (activeChats[chatId]) {
    const message = 
activeInfo +
`Kamu sedang chat dengan partner.

Pilih:
• *Next* untuk ganti partner.
• *End Chat* untuk akhiri sesi.
• *Help* untuk panduan.`;
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Next', callback_data: 'menu_next' }, { text: 'End Chat', callback_data: 'menu_end' }],
          [{ text: 'Help', callback_data: 'menu_help' }]
        ]
      }
    };
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...keyboard });
    return;
  }

  // Jika user sedang dalam antrian mencari partner
  if (waitingUsers.find(u => u.chatId === chatId)) {
    const message = 
activeInfo +
`Sedang mencari partner, tunggu ya...`;
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Help', callback_data: 'menu_help' }]
        ]
      }
    };
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...keyboard });
    return;
  }
}

// Utilitas: hapus user dari antrian
function removeWaitingUser(chatId) {
  waitingUsers = waitingUsers.filter(user => user.chatId !== chatId);
}

// Fungsi untuk mencocokkan partner
function matchUser(chatId) {
  removeWaitingUser(chatId);

  // Jika tidak ada user menunggu, masukkan ke antrian
  if (waitingUsers.length === 0) {
    waitingUsers.push({ chatId });
    bot.sendMessage(chatId, 'Sedang mencari partner anonim untukmu, tunggu ya...');
    return;
  }
  
  // Ambil partner pertama dari antrian
  const partner = waitingUsers.shift();
  activeChats[chatId] = partner.chatId;
  activeChats[partner.chatId] = chatId;
  
  bot.sendMessage(chatId, 'Partner ditemukan! Mulai ngobrol secara anonim.');
  bot.sendMessage(partner.chatId, 'Partner ditemukan! Mulai ngobrol secara anonim.');
}

// Fungsi untuk mengakhiri sesi chat aktif (End Chat)
function endChat(chatId) {
  const partnerId = activeChats[chatId];
  if (partnerId) {
    delete activeChats[chatId];
    delete activeChats[partnerId];
    
    bot.sendMessage(chatId, 'Chat dengan partner telah diakhiri.');
    bot.sendMessage(partnerId, 'Partner telah mengakhiri chat. Kamu bisa cari partner baru setelahnya.');
  } else {
    bot.sendMessage(chatId, 'Kamu belum berada dalam sesi chat.');
  }
}

// Fungsi untuk fitur Next: mengakhiri sesi aktif dan mencari partner baru
function nextChat(chatId) {
  // Validasi: tidak bisa Next jika sedang dalam antrian
  if (waitingUsers.find(u => u.chatId === chatId)) {
    bot.sendMessage(chatId, 'Kamu sedang dalam antrian, tidak bisa ganti partner saat ini.');
    return;
  }
  if (activeChats[chatId]) {
    const partnerId = activeChats[chatId];
    delete activeChats[chatId];
    delete activeChats[partnerId];
    bot.sendMessage(chatId, 'Mengakhiri chat dengan partner dan mencari partner baru...');
    bot.sendMessage(partnerId, 'Partner kamu memilih untuk mencari partner baru.');
    matchUser(chatId);
  } else {
    bot.sendMessage(chatId, 'Kamu belum berada dalam sesi chat.');
  }
}

// Fungsi untuk menampilkan pesan bantuan
function showHelp(chatId) {
  const helpMessage =
`*Help - Panduan Penggunaan AnonChat Bot*  
Perintah yang tersedia:

• /start - Mulai bot dan tampilkan menu sesuai status kamu  
• /setgender - Set atau ubah gender kamu  
• /find - Cari partner chat anonim (hanya tersedia jika gender sudah diset)  
• /next - Ganti partner chat aktif dengan yang baru (jika sudah terhubung)  
• /end - Akhiri sesi chat yang aktif  
• /active - Lihat jumlah pengguna aktif  
• /help - Tampilkan panduan penggunaan

Kamu juga dapat menggunakan tombol di menu untuk navigasi.`;
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
}

// Fungsi untuk menampilkan jumlah pengguna aktif (jika dibutuhkan lewat perintah /active)
function showActiveUsers(chatId) {
  const activeChatCount = Object.keys(activeChats).length / 2;
  const waitingCount = waitingUsers.length;
  const totalActive = activeChatCount + waitingCount;
  const msgText =
`*RuangRahasia*\n\nPengguna aktif:
• Dalam sesi chat: *${activeChatCount}*
• Dalam antrian: *${waitingCount}*
• Total: *${totalActive}*`;
  bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
}

// Endpoint untuk menerima update dari webhook Telegram
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Handler untuk pesan masuk (perintah atau pesan)
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  
  // Jika pesan merupakan perintah (dimulai dengan '/')
  if (msg.text && msg.text.trim().startsWith('/')) {
    const parts = msg.text.trim().split(' ');
    const command = parts[0].toLowerCase();

    switch (command) {
      case '/start':
        sendDynamicMenu(chatId);
        break;

      case '/setgender':
        if (parts.length >= 2) {
          const gender = parts[1].toLowerCase();
          if (gender !== 'male' && gender !== 'female') {
            bot.sendMessage(chatId, 'Gender tidak valid. Hanya menerima "male" atau "female".');
            return;
          }
          userProfiles[chatId] = { gender };
          bot.sendMessage(chatId, `Gender kamu telah diset ke: ${gender}`);
          sendDynamicMenu(chatId);
        } else {
          bot.sendMessage(chatId, 'Pilih gender kamu:', genderKeyboard);
        }
        break;

      case '/find':
        if (!userProfiles[chatId] || !userProfiles[chatId].gender) {
          bot.sendMessage(chatId, 'Silakan set gender terlebih dahulu dengan /setgender atau lewat menu.');
          return;
        }
        if (activeChats[chatId]) {
          bot.sendMessage(chatId, 'Kamu sudah sedang dalam sesi chat.');
          return;
        }
        if (waitingUsers.find(u => u.chatId === chatId)) {
          bot.sendMessage(chatId, 'Kamu sudah dalam antrian, tunggu ya...');
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

      case '/next':
        nextChat(chatId);
        break;

      case '/active':
        showActiveUsers(chatId);
        break;

      case '/help':
        showHelp(chatId);
        break;

      default:
        bot.sendMessage(chatId, 'Perintah tidak dikenali. Gunakan /help untuk panduan penggunaan.');
        break;
    }
  } else {
    // Pesan non-perintah: jika ada sesi aktif, teruskan pesan (dengan reply mapping)
    if (activeChats[chatId]) {
      const partnerId = activeChats[chatId];
      forwardMessage(chatId, partnerId, msg);
    } else {
      bot.sendMessage(chatId, 'Kamu belum berada dalam sesi chat. Silakan cari partner melalui menu atau dengan /find.');
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
    bot.sendMessage(chatId, 'Pilih gender kamu:', genderKeyboard);
  } else if (action === 'set_gender_male') {
    userProfiles[chatId] = { gender: 'male' };
    bot.answerCallbackQuery(callbackQuery.id, { text: "Gender diset ke male" });
    bot.sendMessage(chatId, "Gender kamu telah diset ke male.");
    sendDynamicMenu(chatId);
  } else if (action === 'set_gender_female') {
    userProfiles[chatId] = { gender: 'female' };
    bot.answerCallbackQuery(callbackQuery.id, { text: "Gender diset ke female" });
    bot.sendMessage(chatId, "Gender kamu telah diset ke female.");
    sendDynamicMenu(chatId);
  } else if (action === 'menu_find') {
    if (!userProfiles[chatId] || !userProfiles[chatId].gender) {
      bot.answerCallbackQuery(callbackQuery.id, { text: "Set gender dulu ya!" });
      bot.sendMessage(chatId, 'Silakan set gender kamu terlebih dahulu melalui /setgender atau tombol "Set Gender".');
    } else if (activeChats[chatId]) {
      bot.answerCallbackQuery(callbackQuery.id, { text: "Kamu sudah sedang chat." });
      bot.sendMessage(chatId, 'Kamu sudah dalam sesi chat dengan partner.');
    } else if (waitingUsers.find(u => u.chatId === chatId)) {
      bot.answerCallbackQuery(callbackQuery.id, { text: "Sedang mencari partner." });
      bot.sendMessage(chatId, 'Kamu sudah dalam antrian, tunggu ya...');
    } else {
      bot.answerCallbackQuery(callbackQuery.id);
      matchUser(chatId);
    }
  } else if (action === 'menu_next') {
    bot.answerCallbackQuery(callbackQuery.id);
    nextChat(chatId);
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
