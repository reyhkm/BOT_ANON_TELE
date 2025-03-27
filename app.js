const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios'); // For customTranslate

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
// Format: { [userId]: { from: 'xx', to: 'yy' } }
let userLanguagePairs = {};

// Data structure to store temporary selections when setting language
// Format: { [userId]: { source: string|null } }
let pendingLanguageSelections = {};

// Utility: Map language aliases to ISO 639-1 codes
function mapLanguage(lang) {
  const mapping = {
    indo: 'id',
    farsi: 'fa',
    rusia: 'ru',
    english: 'en',
    spanish: 'es',
    french: 'fr',
    german: 'de',
    chinese: 'zh',
    japanese: 'ja'
  };
  return mapping[lang.toLowerCase()];
}

// Utility: Array of language options for the interactive menu
const languageOptions = [
  { name: 'indo', label: 'Indonesian' },
  { name: 'farsi', label: 'Farsi' },
  { name: 'rusia', label: 'Russian' },
  { name: 'english', label: 'English' },
  { name: 'spanish', label: 'Spanish' },
  { name: 'french', label: 'French' },
  { name: 'german', label: 'German' },
  { name: 'chinese', label: 'Chinese' },
  { name: 'japanese', label: 'Japanese' }
];

// Function to send source language selection menu
function sendSourceLanguageMenu(chatId) {
  const keyboard = languageOptions.map(opt => [{
    text: opt.label,
    callback_data: `set_source:${opt.name}`
  }]);
  bot.sendMessage(chatId, 'Select the SOURCE language:', {
    reply_markup: { inline_keyboard: keyboard }
  });
}

// Function to send target language selection menu
// Exclude the source language option from the list
function sendTargetLanguageMenu(chatId, source) {
  const filteredOptions = languageOptions.filter(opt => opt.name !== source);
  const keyboard = filteredOptions.map(opt => [{
    text: opt.label,
    callback_data: `set_target:${opt.name}`
  }]);
  bot.sendMessage(chatId, 'Select the TARGET language:', {
    reply_markup: { inline_keyboard: keyboard }
  });
}

// Handler for the /setlang command
// If the user sends /setlang without complete parameters, display an interactive menu.
function handleSetLangCommand(msg, parts) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (parts.length >= 3) {
    // Process complete parameters
    const fromLang = mapLanguage(parts[1]);
    const toLang = mapLanguage(parts[2]);
    
    if (!fromLang || !toLang) {
      bot.sendMessage(chatId, 'Supported languages: indo, farsi, rusia, english, spanish, french, german, chinese, japanese.');
      return;
    }
    if (fromLang === toLang) {
      bot.sendMessage(chatId, 'The source and target languages must be different.');
      return;
    }
    userLanguagePairs[userId] = { from: fromLang, to: toLang };
    bot.sendMessage(chatId, `Language preference saved.\nYour messages will be translated from *${parts[1]}* to *${parts[2]}*.`, { parse_mode: 'Markdown' });
  } else {
    // If parameters are incomplete, display the interactive menu
    pendingLanguageSelections[userId] = { source: null };
    sendSourceLanguageMenu(chatId);
  }
}

// Custom translate function using the custom API endpoint
async function customTranslate(text, from, to) {
  const url = 'https://translate-pa.googleapis.com/v1/translateHtml';
  const apiKey = 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520';
  const requestBody = JSON.stringify([[[text], from, to], "wt_lib"]);
  
  try {
    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json+protobuf',
        'X-Goog-API-Key': apiKey
      }
    });
    // Expected response format: [[translatedText], [detectedLanguage]]
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

  // Process the /setlang command
  if (text.startsWith('/setlang')) {
    const parts = text.split(' ');
    handleSetLangCommand(msg, parts);
    return;
  }

  // Optionally, ignore other commands (messages starting with "/")
  if (text.startsWith('/')) return;

  // If the user has set language preferences, automatically translate the message
  const pref = userLanguagePairs[userId];
  if (pref) {
    try {
      const translatedText = await customTranslate(text, pref.from, pref.to);
      bot.sendMessage(chatId, translatedText, { reply_to_message_id: originalMessageId });
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

// Handler for callback queries (interactive menu)
bot.on('callback_query', (callbackQuery) => {
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const chatId = callbackQuery.message.chat.id;

  // Source language selection
  if (data.startsWith('set_source:')) {
    const source = data.split(':')[1];
    if (!pendingLanguageSelections[userId]) {
      pendingLanguageSelections[userId] = { source: null };
    }
    pendingLanguageSelections[userId].source = source;
    bot.answerCallbackQuery(callbackQuery.id, { text: `Source language selected: ${source}` });
    sendTargetLanguageMenu(chatId, source);
    return;
  }

  // Target language selection
  if (data.startsWith('set_target:')) {
    const target = data.split(':')[1];
    const pending = pendingLanguageSelections[userId];
    if (!pending || !pending.source) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Please select the source language first.' });
      return;
    }
    if (pending.source === target) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'The target language must be different from the source language.' });
      return;
    }
    // Save the language preference for the user
    userLanguagePairs[userId] = { from: mapLanguage(pending.source), to: mapLanguage(target) };
    bot.answerCallbackQuery(callbackQuery.id, { text: `Language preference saved: ${pending.source} → ${target}` });
    bot.sendMessage(chatId, `Your language preference has been saved.\nYour messages will be translated from *${pending.source}* to *${target}*.`, { parse_mode: 'Markdown' });
    // Clear temporary selection
    delete pendingLanguageSelections[userId];
    return;
  }
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
