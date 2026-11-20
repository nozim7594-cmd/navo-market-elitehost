import {test} from 'node:test';
import assert from 'node:assert/strict';
import {autoConfigureTelegram,configureTelegramBot} from '../telegram-setup.mjs';

const env={BOT_TOKEN:'test-token',BOT_USERNAME:'nft_renters_bot',PUBLIC_URL:'https://shop.example/',TELEGRAM_WEBHOOK_SECRET:'test-secret-'.repeat(4)};
function telegram(overrides={}){
 const calls=[];
 const results={getMe:{username:'nft_renters_bot'},setWebhook:true,setChatMenuButton:true,getWebhookInfo:{url:'https://shop.example/api/telegram/webhook'},getChatMenuButton:{type:'web_app',web_app:{url:'https://shop.example'}},...overrides};
 return {calls,fetchImpl:async(url,options)=>{
  const method=url.split('/').at(-1);calls.push({method,...JSON.parse(options.body)});
  assert.equal(options.method,'POST');assert.ok(options.signal instanceof AbortSignal);
  return {ok:true,json:async()=>({ok:true,result:results[method]})};
 }};
}
test('startup configures and verifies the correct bot without discarding pending payment updates',async()=>{
 const api=telegram(),logs=[];
 await autoConfigureTelegram(env,{...api,logger:{log:m=>logs.push(m),error:assert.fail}});
 assert.deepEqual(api.calls.map(c=>c.method),['getMe','setWebhook','setChatMenuButton','getWebhookInfo','getChatMenuButton']);
 assert.deepEqual(api.calls[1],{method:'setWebhook',url:'https://shop.example/api/telegram/webhook',secret_token:env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','pre_checkout_query']});
 assert.equal(api.calls[2].menu_button.web_app.url,'https://shop.example');
 assert.match(logs[0],/Telegram bot connected/);
});
test('a token for a different bot never changes webhook or menu',async()=>{
 const api=telegram({getMe:{username:'another_bot'}});
 await assert.rejects(configureTelegramBot(env,api),/does not match/);
 assert.deepEqual(api.calls.map(c=>c.method),['getMe']);
});
test('missing settings and explicit opt-out do not call Telegram',async()=>{
 const api={fetchImpl:()=>assert.fail('unexpected Telegram call'),logger:{log:()=>{},error:assert.fail}};
 await autoConfigureTelegram({},api);
 await autoConfigureTelegram({...env,TELEGRAM_AUTO_SETUP:'false'},api);
 await assert.rejects(configureTelegramBot({...env,PUBLIC_URL:'http://shop.example'},api),/HTTPS origin/);
 await assert.rejects(configureTelegramBot({...env,TELEGRAM_WEBHOOK_SECRET:'short'},api),/32-256/);
});
test('setup failure is nonfatal and transport details never appear in logs',async()=>{
 const logs=[];
 await autoConfigureTelegram(env,{fetchImpl:async()=>{throw Error(`https://api.telegram.org/bot${env.BOT_TOKEN} ${env.TELEGRAM_WEBHOOK_SECRET}`)},logger:{log:assert.fail,error:m=>logs.push(m)}});
 assert.equal(logs.length,1);
 assert.match(logs[0],/Telegram setup incomplete/);
 assert.ok(!logs[0].includes(env.BOT_TOKEN));assert.ok(!logs[0].includes(env.TELEGRAM_WEBHOOK_SECRET));
});
test('setup reports failure if Telegram rejects changes or verification disagrees',async()=>{
 await assert.rejects(configureTelegramBot(env,{fetchImpl:async()=>({ok:false,json:async()=>({ok:false,description:env.BOT_TOKEN})})}),/getMe failed/);
 await assert.rejects(configureTelegramBot(env,telegram({getWebhookInfo:{url:'https://other.example/api/telegram/webhook'}})),/verification failed/);
});
