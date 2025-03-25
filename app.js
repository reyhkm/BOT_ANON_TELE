const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Configure token and webhook
const TOKEN = '7783307198:AAFNOoLG-I-xMsPZMnDSqWXHXFshigXuKxU';
const WEBHOOK_URL = 'https://botanontele-production.up.railway.app';

// Initialize bot with webhook
const bot = new TelegramBot(TOKEN, { polling: false });
bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`)
  .then(() => console.log(`Webhook has been set to ${WEBHOOK_URL}/bot${TOKEN}`))
  .catch(err => console.error('Failed to set webhook:', err));

// Initialize Express
const app = express();
app.use(bodyParser.json());

// Data structure to store language preferences per user
// Format: { [userId]: { from: 'id'|'fa', to: 'fa'|'id' } }
let userLanguagePairs = {};

// Utility: Map language aliases to ISO 639-1 codes
function mapLanguage(lang) {
  const mapping = {
    indo: 'id',
    farsi: 'fa'
  };
  return mapping[lang.toLowerCase()];
}

// Handler for /setlang command
// Example: /setlang indo farsi  (translate from Indonesian to Farsi)
function handleSetLangCommand(msg, parts) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (parts.length < 3) {
    bot.sendMessage(chatId, 'Invalid format. Use: /setlang <source> <target>\nExample: /setlang indo farsi');
    return;
  }
  
  const fromLang = mapLanguage(parts[1]);
  const toLang = mapLanguage(parts[2]);
  
  if (!fromLang || !toLang) {
    bot.sendMessage(chatId, 'Supported languages are only: indo and farsi.');
    return;
  }
  
  if (fromLang === toLang) {
    bot.sendMessage(chatId, 'Source and target languages must not be the same.');
    return;
  }
  
  // Save language preference for the specific user
  userLanguagePairs[userId] = { from: fromLang, to: toLang };
  bot.sendMessage(chatId, `Language preference saved for you.\nYour messages will be translated from *${parts[1]}* to *${parts[2]}*.`, { parse_mode: 'Markdown' });
}

// Custom translate function using the discovered API endpoint
async function customTranslate(text, from, to) {
  const url = 'https://translate-pa.googleapis.com/v1/translateHtml';
  // API Key found on forum (gunakan dengan hati-hati)
  const apiKey = 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520';
  
  // Request body sesuai format yang ditemukan:
  // [[["Text to translate"], "auto", "en"], "wt_lib"]
  // Namun kita gunakan parameter 'from' dan 'to' yang sudah diatur
  const requestBody = JSON.stringify([[[text], from, to], "wt_lib"]);
  
  try {
    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json+protobuf',
        'X-Goog-API-Key': apiKey
      }
    });
    // Response expected format: [[translatedText], [detectedLanguage]]
    // Ambil translatedText dari response.data[0][0]
    return response.data[0][0];
  } catch (err) {
    console.error("Translation error:", err);
    throw err;
  }
}

// Main function to process text messages from the group
async function processGroupMessage(msg) {
  const chatId = msg.chat.id;
  const originalMessageId = msg.message_id;
  const text = msg.text && msg.text.trim();
  const userId = msg.from.id;

  if (!text) return;

  // If the message is a /setlang command, process it first
  if (text.startsWith('/setlang')) {
    const parts = text.split(' ');
    handleSetLangCommand(msg, parts);
    return;
  }

  // Optional: Ignore other commands (starting with "/")
  if (text.startsWith('/')) return;

  // If user has set language preferences, translate the message automatically
  const pref = userLanguagePairs[userId];
  if (pref) {
    try {
      const translatedText = await customTranslate(text, pref.from, pref.to);
      bot.sendMessage(chatId, `${translatedText}`, { parse_mode: 'Markdown', reply_to_message_id: originalMessageId });
    } catch (err) {
      bot.sendMessage(chatId, 'An error occurred while translating the message.', { reply_to_message_id: originalMessageId });
    }
  }
}

// Endpoint to receive updates from Telegram webhook
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Handler for incoming messages
bot.on('message', (msg) => {
  if (msg.text) {
    processGroupMessage(msg);
  }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
