const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const translate = require('@iamtraction/google-translate');

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

// Data structure to store user language preferences
// Format: { [chatId]: { from: 'id'|'ar', to: 'ar'|'id' } }
let userLanguagePairs = {};

// Utility: Map language aliases to ISO 639-1 codes
function mapLanguage(lang) {
  const mapping = {
    indo: 'id',
    arab: 'ar'
  };
  return mapping[lang.toLowerCase()];
}

// Handler for /setlang command
// Example: /setlang indo arab  (translate from Indonesian to Arabic)
function handleSetLangCommand(chatId, parts) {
  if (parts.length < 3) {
    bot.sendMessage(chatId, 'Invalid format. Use: /setlang <source> <target>\nExample: /setlang indo arab');
    return;
  }
  const fromLang = mapLanguage(parts[1]);
  const toLang = mapLanguage(parts[2]);
  if (!fromLang || !toLang) {
    bot.sendMessage(chatId, 'Supported languages are only: indo and arab.');
    return;
  }
  if (fromLang === toLang) {
    bot.sendMessage(chatId, 'Source and target languages must not be the same.');
    return;
  }
  userLanguagePairs[chatId] = { from: fromLang, to: toLang };
  bot.sendMessage(chatId, `Language preference saved.\nYour messages will be translated from *${parts[1]}* to *${parts[2]}*.`, { parse_mode: 'Markdown' });
}

// Main function to process text messages from the group
async function processGroupMessage(msg) {
  const chatId = msg.chat.id;
  const originalMessageId = msg.message_id;
  const text = msg.text && msg.text.trim();

  if (!text) return;

  // If the message is a /setlang command, process it first
  if (text.startsWith('/setlang')) {
    const parts = text.split(' ');
    handleSetLangCommand(chatId, parts);
    return;
  }

  // Optional: Ignore messages that are other commands (start with "/")
  if (text.startsWith('/')) return;

  // If the user has set language preferences, translate the message directly
  const pref = userLanguagePairs[chatId];
  if (pref) {
    try {
      // The @iamtraction/google-translate library automatically handles autocorrect and spelling correction
      const result = await translate(text, { from: pref.from, to: pref.to });
      
      // Example: If you want to display autocorrect information, you can check the following properties:
      // result.from.autoCorrected -> boolean
      // result.from.text.value -> string that has been corrected (if available)
      
      bot.sendMessage(chatId, `${result.text}`, { parse_mode: 'Markdown', reply_to_message_id: originalMessageId });
    } catch (err) {
      console.error('Error while translating:', err);
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
