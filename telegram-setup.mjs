// Shared by normal server startup and the optional shell setup command.
export async function configureTelegramBot(env,{fetchImpl=fetch}={}){
 const {BOT_TOKEN,BOT_USERNAME,PUBLIC_URL,TELEGRAM_WEBHOOK_SECRET}=env;
 if(!BOT_TOKEN||!BOT_USERNAME)throw Error('Fill BOT_TOKEN and BOT_USERNAME in .env.');
 if(!/^[A-Za-z0-9_-]{32,256}$/.test(TELEGRAM_WEBHOOK_SECRET||''))throw Error('TELEGRAM_WEBHOOK_SECRET must contain 32-256 letters, digits, underscores or hyphens.');
 let origin;
 try{
  const url=new URL(PUBLIC_URL);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error();
  origin=url.origin;
 }catch{throw Error('Set PUBLIC_URL to the HTTPS origin of your Mini App.');}
 async function call(method,body){
  let response,result;
  try{
   response=await fetchImpl(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(12000)
   });
   result=await response.json();
  }catch{throw Error(`Telegram ${method} unavailable; check network access and restart.`);}
  // Never log raw transport errors or Telegram descriptions: they may contain credentials.
  if(!response.ok||!result?.ok)throw Error(`Telegram ${method} failed; check bot settings and restart.`);
  return result.result;
 }
 const me=await call('getMe');
 if(me?.username?.toLowerCase()!==BOT_USERNAME.replace(/^@/,'').toLowerCase())throw Error('BOT_TOKEN does not match BOT_USERNAME.');
 const webhook=origin+'/api/telegram/webhook';
 await call('setWebhook',{url:webhook,secret_token:TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','pre_checkout_query']});
 await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Bozor',web_app:{url:origin}}});
 const info=await call('getWebhookInfo');
 const menu=await call('getChatMenuButton');
 if(info?.url!==webhook||menu?.web_app?.url?.replace(/\/$/,'')!==origin)throw Error('Telegram bot setup verification failed; check settings and restart.');
}

export async function autoConfigureTelegram(env,{fetchImpl=fetch,logger=console}={}){
 if(env.TELEGRAM_AUTO_SETUP==='false')return;
 const missing=['BOT_TOKEN','TELEGRAM_WEBHOOK_SECRET'].filter(key=>!env[key]);
 if(missing.length){logger.log(`Telegram setup skipped: fill ${missing.join(', ')} in .env and restart.`);return;}
 try{
  await configureTelegramBot(env,{fetchImpl});
  logger.log('Telegram bot connected: webhook and Bozor menu verified.');
 }catch(error){logger.error(`Telegram setup incomplete: ${error.message}`);}
}
