import {publicSettings} from '../settings.mjs';
import {configureTelegramBot} from '../telegram-setup.mjs';
// Optional shell command; normal server startup now performs the same setup.
await configureTelegramBot(publicSettings(process.env));
console.log('Telegram bot connected: webhook and Bozor menu verified.');
