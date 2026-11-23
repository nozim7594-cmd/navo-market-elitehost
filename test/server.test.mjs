import {test} from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';import http from 'node:http';import {makeApp,verifyTelegram} from '../server.mjs';
const token='test-only-token';
function signed(id=12,overrides={}){const p=new URLSearchParams({user:JSON.stringify({id,first_name:'Test'}),auth_date:String(Math.floor(Date.now()/1000)),signature:'test-signature',...overrides});const data=[...p].sort(([a],[b])=>a<b?-1:1).map(([k,v])=>`${k}=${v}`).join('\n');const secret=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',secret).update(data).digest('hex'));return p.toString()}
test('Telegram signature, expiry and tamper protection',()=>{assert.equal(verifyTelegram(signed(),token).id,12);assert.throws(()=>verifyTelegram(signed()+'x',token));assert.throws(()=>verifyTelegram(signed(12,{auth_date:'1'}),token));assert.throws(()=>verifyTelegram(signed(12,{auth_date:String(Math.floor(Date.now()/1000)+500)}),token));assert.throws(()=>verifyTelegram(signed()+'&user=x',token))});
async function fixture(t,extraEnv={}){const calls=[];const app=makeApp({dbPath:':memory:',env:{BOT_TOKEN:token,ADMIN_IDS:'99',CRYPTO_MANUAL_ENABLED:'true',CRYPTO_WALLET:'test-wallet',STARS_PER_TON:'100',TELEGRAM_WEBHOOK_SECRET:'secret',...extraEnv},telegramFetch:async(url,opts)=>{calls.push(JSON.parse(opts.body));return {ok:true,json:async()=>({ok:true,result:'https://t.me/test-invoice'})}}});const server=http.createServer(app.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));app.close()});const base='http://127.0.0.1:'+server.address().port;async function req(path,body,id=12,extra={}){const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(id?{'X-Telegram-Init-Data':signed(id)}:{}),...extra},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}return {...app,calls,req}}
test('manual payment approval is admin-only, credits exactly once and isolates users',async t=>{const {req}=await fixture(t);assert.equal((await req('payments',{method:'crypto',amount:2,reference:'a'.repeat(64)},null)).status,401);await req('bootstrap',undefined,99);let r=await req('payments',{method:'crypto',amount:2,reference:'a'.repeat(64)});assert.equal(r.status,200);const id=r.data.id;assert.equal((await req('admin/payments',{id,approve:true})).status,403);assert.equal((await req('admin/payments',{id,approve:true},99)).status,200);assert.equal((await req('admin/payments',{id,approve:true},99)).status,409);assert.equal((await req('bootstrap')).data.user.balance,2000000);assert.equal((await req('payments',undefined,13)).data.length,0);assert.equal((await req('payments',{method:'crypto',amount:2,reference:'A'.repeat(64)})).status,409)});
test('rentals debit atomically, prevent overlapping bookings and refund only once',async t=>{const {req,db}=await fixture(t);await req('bootstrap');await req('bootstrap',undefined,99);db.prepare('UPDATE users SET balance=1000000 WHERE id=12').run();const p=(await req('admin/products',{name:'Test',serial:'#1',kind:'gift',emoji:'💎',color:'#123456',price:.2},99)).data;const r=await req('rent',{product_id:p.id,days:3});assert.equal(r.status,200);assert.equal(r.data.balance,400000);assert.equal((await req('rent',{product_id:p.id,days:1})).status,409);assert.equal((await req('rentals',undefined,13)).data.length,0);assert.equal((await req('admin/rentals',{id:r.data.id,deliver:false},99)).status,200);assert.equal((await req('admin/rentals',{id:r.data.id,deliver:false},99)).status,409);assert.equal((await req('bootstrap')).data.user.balance,1000000);assert.equal((await req('rent',{product_id:p.id,days:7})).status,400);assert.equal((await req('bootstrap')).data.user.balance,1000000)});
test('Stars credits only after valid Telegram payment, duplicates never credit twice',async t=>{const {req,db,calls}=await fixture(t);const p=await req('payments',{method:'stars',amount:200});assert.ok(p.data.invoice_url);const row=db.prepare('SELECT * FROM payments WHERE id=?').get(p.data.id);const update={message:{from:{id:12},successful_payment:{invoice_payload:row.invoice,currency:'XTR',total_amount:200,telegram_payment_charge_id:'charge-1'}}};assert.equal((await req('telegram/webhook',update,null)).status,403);const headers={'X-Telegram-Bot-Api-Secret-Token':'secret'};const bad=structuredClone(update);bad.message.successful_payment.total_amount=201;assert.notEqual((await req('telegram/webhook',bad,null,headers)).status,200);assert.equal((await req('bootstrap')).data.user.balance,0);assert.equal((await req('telegram/webhook',update,null,headers)).status,200);assert.equal((await req('telegram/webhook',update,null,headers)).status,200);assert.equal((await req('bootstrap')).data.user.balance,2000000);assert.equal(calls[0].currency,'XTR');assert.equal(calls[0].prices[0].amount,200)});
test('expired assets remain blocked until admin confirms return',async t=>{const {req,db}=await fixture(t);await req('bootstrap');await req('bootstrap',undefined,99);db.prepare('UPDATE users SET balance=1000000 WHERE id=12').run();const p=(await req('admin/products',{name:'Return test',serial:'#2',kind:'gift',emoji:'💎',color:'#123456',price:.1},99)).data;const r=(await req('rent',{product_id:p.id,days:1})).data;await req('admin/rentals',{id:r.id,deliver:true},99);db.prepare('UPDATE rentals SET ends_at=1 WHERE id=?').run(r.id);assert.equal((await req('bootstrap')).data.products[0].available,false);assert.equal((await req('rentals')).data[0].status,'returning');assert.equal((await req('rent',{product_id:p.id,days:1})).status,409);assert.equal((await req('admin')).status,403);assert.equal((await req('admin',undefined,99)).data.rentals[0].status,'returning');await req('admin/rentals',{id:r.id,deliver:true},99);assert.equal((await req('bootstrap')).data.products[0].available,true)});

test('TON invoice API is user-scoped, never manually approvable and does not credit on creation',async t=>{
 const {req,db}=await fixture(t,{CRYPTO_WALLET:'0:'+'1'.repeat(64),TON_AUTO_PAYMENTS:'true',TONCENTER_API_KEY:'test',CRYPTO_MANUAL_ENABLED:'false'});
 assert.equal((await req('payments',{method:'ton',amount:1},null)).status,401);
 const invoice=await req('payments',{method:'ton',amount:1});assert.equal(invoice.status,200);assert.match(invoice.data.memo,/^navo_/);
 assert.equal((await req('me')).data.balance,0);assert.equal((await req('payments',undefined,13)).data.length,0);
 assert.equal((await req('admin/payments',{id:invoice.data.id,approve:true},99)).status,400);
 assert.equal((await req('payments',{method:'crypto',amount:1,reference:'a'.repeat(64)})).status,400);
 assert.equal((await req('payments')).data[0].memo,invoice.data.memo);
 assert.equal(db.prepare('SELECT balance FROM users WHERE id=12').get().balance,0);
});

test('configured Stars rate credits exact microTON and is frozen in each invoice',async t=>{
 const {req,db}=await fixture(t,{STARS_MICRO_TON_PER_STAR:'13000'});
 const config=(await req('bootstrap')).data.config;
 assert.equal(config.stars_ton_per_100,1.3);assert.equal(config.stars_credit_micro,13000);
 let expected=0;
 for(const amount of [1,100,250,1000]){
  const invoice=await req('payments',{method:'stars',amount});assert.equal(invoice.status,200);
  const row=db.prepare('SELECT * FROM payments WHERE id=?').get(invoice.data.id);
  assert.equal(row.credit,amount*13000);
  const update={message:{from:{id:12},successful_payment:{invoice_payload:row.invoice,currency:'XTR',total_amount:amount,telegram_payment_charge_id:'rate-'+amount}}};
  const headers={'X-Telegram-Bot-Api-Secret-Token':'secret'};
  assert.equal((await req('telegram/webhook',update,null,headers)).status,200);
  expected+=amount*13000;assert.equal((await req('me')).data.balance,expected);
 }
});

test('TON Connect transaction uses the authenticated invoice and cannot change balances',async t=>{
 const {req,db}=await fixture(t,{CRYPTO_WALLET:'0:'+'1'.repeat(64),TON_AUTO_PAYMENTS:'true',TONCENTER_API_KEY:'test'});
 const invoice=(await req('payments',{method:'ton',amount:1.234567})).data;
 assert.equal((await req('payments/ton-transaction',{id:invoice.id},null)).status,401);
 await req('bootstrap',undefined,13);
 assert.equal((await req('payments/ton-transaction',{id:invoice.id},13)).status,404);
 const result=await req('payments/ton-transaction',{id:invoice.id,amount:'1',wallet:'attacker',memo:'fake'});
 assert.equal(result.status,200);assert.equal(result.data.network,'-239');
 assert.ok(result.data.validUntil<=Math.floor(Date.now()/1000)+300);
 const {Cell,Address}=await import('@ton/ton');
 const message=result.data.messages[0];assert.equal(message.amount,'1234567000');
 assert.ok(Address.parse(message.address).equals(Address.parse(invoice.wallet)));
 const body=Cell.fromBase64(message.payload).beginParse();assert.equal(body.loadUint(32),0);assert.equal(body.loadStringTail(),invoice.memo);
 assert.equal((await req('me')).data.balance,0);
 db.prepare("UPDATE payments SET status='approved' WHERE id=?").run(invoice.id);
 assert.equal((await req('payments/ton-transaction',{id:invoice.id})).status,409);
 const expired=(await req('payments',{method:'ton',amount:1})).data;
 db.prepare('UPDATE ton_invoices SET expires_at=1 WHERE payment_id=?').run(expired.id);
 assert.equal((await req('payments/ton-transaction',{id:expired.id})).status,409);
});

test('admin can audit balance changes; other users cannot alter balances',async t=>{
 const {req,db}=await fixture(t);await req('bootstrap');await req('bootstrap',undefined,99);
 const id='bfc99a4d-0e73-4e0c-905a-f8831479da01';
 const change={user_id:12,delta:1.25,reason:'Verified support correction',request_id:id};
 assert.equal((await req('admin/users')).status,403);
 assert.equal((await req('admin/balance',change)).status,403);
 assert.equal((await req('admin/balance',change,99)).status,200);
 assert.equal((await req('admin/balance',change,99)).status,200);
 assert.equal((await req('me')).data.balance,1250000);
 assert.equal((await req('admin/balance',{...change,delta:2},99)).status,409);
 assert.equal((await req('admin/balance',{...change,delta:-2,request_id:'cef37571-d09f-4fe1-9c67-c14f55b2417b'},99)).status,409);
 assert.equal((await req('admin/balance',{...change,delta:-0.25,request_id:'cef37571-d09f-4fe1-9c67-c14f55b2417b'},99)).status,200);
 const result=await req('admin/users?q=12',undefined,99);assert.equal(result.status,200);assert.equal(result.data.users.find(u=>u.id===12).balance,1000000);
 assert.equal(result.data.history.length,2);assert.equal(db.prepare('SELECT count(*) AS n FROM balance_adjustments').get().n,2);
});
