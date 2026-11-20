await import('./elitehost-check.mjs');
await import('./configure-bot.mjs');
const info=await fetch('https://api.telegram.org/bot'+process.env.BOT_TOKEN+'/getWebhookInfo').then(r=>r.json());
const menu=await fetch('https://api.telegram.org/bot'+process.env.BOT_TOKEN+'/getChatMenuButton').then(r=>r.json());
const url=process.env.PUBLIC_URL.replace(/\/$/,'');
if(info.result?.url!==url+'/api/telegram/webhook'||menu.result?.web_app?.url?.replace(/\/$/,'')!==url)throw Error('Bot setup verification failed.');
console.log('Webhook and Bozor menu verified.');
