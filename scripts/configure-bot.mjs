// Run only after the HTTPS backend is deployed and .env is configured.
const {BOT_TOKEN,PUBLIC_URL,TELEGRAM_WEBHOOK_SECRET}=process.env;
if(!BOT_TOKEN||!PUBLIC_URL?.startsWith('https://')||!TELEGRAM_WEBHOOK_SECRET)throw Error('Configure BOT_TOKEN, HTTPS PUBLIC_URL and TELEGRAM_WEBHOOK_SECRET first.');
for(const [method,body] of [['setWebhook',{url:PUBLIC_URL.replace(/\/$/,'')+'/api/telegram/webhook',secret_token:TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','pre_checkout_query']}],['setChatMenuButton',{menu_button:{type:'web_app',text:'Bozor',web_app:{url:PUBLIC_URL.replace(/\/$/,'')}}}]]){
 const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await r.json();if(!r.ok||!result.ok)throw Error(method+' failed; check bot configuration.');console.log(method+': OK');
}
