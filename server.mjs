import {publicSettings,starsPricing} from './settings.mjs';
import {autoConfigureTelegram} from './telegram-setup.mjs';
import {tonPayments} from './ton-payments.mjs';
import {partnerMarket} from './marketapp.mjs';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
const root=fileURLToPath(new URL('.',import.meta.url));
export function verifyTelegram(raw,token,now=Date.now()/1000){
 if(!token||!raw||raw.length>12000)throw Error('Telegram orqali kiring.');
 const p=new URLSearchParams(raw),hash=p.get('hash');if(!hash||!/^[a-f0-9]{64}$/i.test(hash))throw Error('Telegram imzosi noto‘g‘ri.');
 for(const key of p.keys())if(p.getAll(key).length!==1)throw Error('Telegram ma’lumotlari noto‘g‘ri.');
 p.delete('hash');
 const check=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 const actual=createHmac('sha256',secret).update(check).digest();
 if(!timingSafeEqual(actual,Buffer.from(hash,'hex')))throw Error('Telegram imzosi noto‘g‘ri.');
 const date=Number(p.get('auth_date'));if(!Number.isFinite(date)||now-date>3600||date-now>30)throw Error('Sessiya eskirgan. Ilovani qayta oching.');
 const user=JSON.parse(p.get('user'));if(!Number.isSafeInteger(user.id)||user.id<=0)throw Error('Telegram foydalanuvchisi noto‘g‘ri.');return user;
}
export function makeApp({dbPath=process.env.DB_PATH||root+'navo.sqlite',env=process.env,telegramFetch=fetch,tonClient}={}){
 const db=new DatabaseSync(dbPath);db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0));
 CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,serial TEXT NOT NULL,kind TEXT NOT NULL,emoji TEXT NOT NULL,color TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),enabled INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),method TEXT NOT NULL,amount REAL NOT NULL,credit INTEGER NOT NULL CHECK(credit>0),reference TEXT,invoice TEXT UNIQUE,charge TEXT UNIQUE,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS unique_crypto_reference ON payments(reference) WHERE method='crypto' AND reference IS NOT NULL;
 CREATE TABLE IF NOT EXISTS rentals(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),product_id INTEGER NOT NULL REFERENCES products(id),days INTEGER NOT NULL,total INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,ends_at INTEGER);
 CREATE UNIQUE INDEX IF NOT EXISTS one_open_rental ON rentals(product_id) WHERE status IN ('pending','active','returning');`);
 const admins=String(env.ADMIN_IDS||'').split(',').map(x=>x.trim());
 const now=()=>Math.floor(Date.now()/1000),fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
 function tx(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}
 const partner=partnerMarket({db,tx,env});
 const deposits=tonPayments({db,tx,env,client:tonClient});
 const stars=starsPricing(env);
 function expire(){db.prepare("UPDATE rentals SET status='returning' WHERE status='active' AND ends_at<=?").run(now())}
 function auth(req){let tg;try{tg=verifyTelegram(req.headers['x-telegram-init-data'],env.BOT_TOKEN)}catch(e){fail(e.message,401)}db.prepare('INSERT INTO users(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').run(tg.id,tg.first_name||'Foydalanuvchi');return {...db.prepare('SELECT * FROM users WHERE id=?').get(tg.id),admin:admins.includes(String(tg.id))}}
 async function telegram(method,body){if(!env.BOT_TOKEN)fail('Bot hali sozlanmagan.',503);const r=await telegramFetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok||!data.ok)fail('Telegram to‘lov xizmatiga ulanib bo‘lmadi.',502);return data.result}
 async function parse(req){let body='';for await(const chunk of req){body+=chunk;if(body.length>16000)fail('So‘rov juda katta.',413)}try{return body?JSON.parse(body):{}}catch{fail('JSON noto‘g‘ri.')}}
 function catalog(){expire();return db.prepare("SELECT p.*,NOT EXISTS(SELECT 1 FROM rentals r WHERE r.product_id=p.id AND r.status IN ('pending','active','returning')) AS available FROM products p WHERE enabled=1 ORDER BY id DESC").all().map(p=>({...p,price:p.price/1e6,available:!!p.available}))}
 function paymentUpdate(id,approve){tx(()=>{const p=db.prepare('SELECT * FROM payments WHERE id=?').get(id);if(!p||p.status!=='pending')fail('To‘lov allaqachon ko‘rib chiqilgan.',409);if(p.method!=='crypto')fail('Bu to‘lov avtomatik tasdiqlanadi.');db.prepare('UPDATE payments SET status=? WHERE id=?').run(approve?'approved':'rejected',id);if(approve)db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(p.credit,p.user_id)})}
 async function webhook(body){
 if(body.pre_checkout_query){const q=body.pre_checkout_query,p=db.prepare('SELECT * FROM payments WHERE invoice=?').get(q.invoice_payload);const ok=!!p&&p.status==='pending'&&p.method==='stars'&&p.user_id===q.from.id&&q.currency==='XTR'&&p.amount===q.total_amount;await telegram('answerPreCheckoutQuery',{pre_checkout_query_id:q.id,ok,...(!ok?{error_message:'To‘lov topilmadi yoki summa noto‘g‘ri.'}:{})})}
 const paid=body.message?.successful_payment;if(paid)tx(()=>{const p=db.prepare('SELECT * FROM payments WHERE invoice=?').get(paid.invoice_payload);if(!p||p.status!=='pending')return;if(p.method!=='stars'||p.user_id!==body.message.from.id||paid.currency!=='XTR'||paid.total_amount!==p.amount||!paid.telegram_payment_charge_id)fail('To‘lov ma’lumotlari mos emas.');db.prepare("UPDATE payments SET status='approved',charge=? WHERE id=?").run(paid.telegram_payment_charge_id,p.id);db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(p.credit,p.user_id)});
 if(body.message?.text==='/start'&&env.PUBLIC_URL)await telegram('sendMessage',{chat_id:body.message.chat.id,text:'✨ Navo Market’ga xush kelibsiz!\n\n🎁 Noyob Telegram sovg‘alarini ko‘ring, o‘zingizga mos ijara taklifini tanlang va buyurtmangizni shu yerda kuzating.\n\nBozorni ochish uchun pastdagi tugmani bosing.',reply_markup:{inline_keyboard:[[{text:'🎁 Bozorni ochish',web_app:{url:env.PUBLIC_URL}}]]}});
 return {ok:true};
 }
 const handler=async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');const path=url.pathname;let result;
 if(path==='/tonconnect-manifest.json'&&req.method==='GET'){
 const origin=new URL(env.PUBLIC_URL||'https://gift.novastax.uz').origin;
 res.setHeader('Access-Control-Allow-Origin','*');
 result={url:origin,name:'Navo Market',iconUrl:origin+'/wallet-icon.png'};
 }else if(path==='/healthz' && req.method==='GET'){db.prepare('SELECT 1').get();result={ok:true,service:'navo-market'};}else if(path==='/api/telegram/webhook'){
 if(req.method!=='POST')fail('Usul topilmadi.',405);
 const secret=env.TELEGRAM_WEBHOOK_SECRET,given=req.headers['x-telegram-bot-api-secret-token'];
 if(!secret||typeof given!=='string'||Buffer.byteLength(secret)!==Buffer.byteLength(given)||!timingSafeEqual(Buffer.from(secret),Buffer.from(given)))fail('Ruxsat yo‘q.',403);
 result=await webhook(await parse(req));
 }else if(path.startsWith('/api/')){
 const raw=req.headers['x-telegram-init-data'];const user=raw?auth(req):null;
 if(path==='/api/bootstrap'&&req.method==='GET'){
 let partnerProducts=[],partnerEnabled=false;
 if(env.MARKETAPP_API_TOKEN)try{partnerProducts=await partner.catalog();partnerEnabled=true}catch{}
 result={products:[...partnerProducts,...catalog()],partner_enabled:partnerEnabled,user,config:{marketapp_checkout:partner.billingReady,crypto_wallet:env.CRYPTO_WALLET||'',ton_auto:deposits.enabled,stars_enabled:!!(env.BOT_TOKEN&&env.TELEGRAM_WEBHOOK_SECRET&&stars),stars_per_ton:stars?.starsPerTon||null,stars_ton_per_100:stars?.tonPer100||null,stars_credit_micro:stars?.microPerStar||null}};
 }
 else{
 if(!user)fail('Telegram orqali kiring.',401);
 const write=req.method==='POST';if(!write&&req.method!=='GET')fail('Usul topilmadi.',405);const b=write?await parse(req):{};
 if(path.startsWith('/api/admin')&&!user.admin)fail('Ruxsat yo‘q.',403);
 if(path==='/api/me'&&!write)result=user;
 else if(path==='/api/partner/quote'&&write)result=await partner.quote(user,b);
 else if(path==='/api/partner/reconnect'&&write)result=partner.reconnect(user,b);
 else if(path==='/api/partner/rent'&&write)result=await partner.rent(user,b);
 else if(path==='/api/payments'&&!write){deposits.expire();result=db.prepare('SELECT p.id,p.method,p.amount,p.reference,p.status,p.created_at,i.memo,i.expires_at,i.nano,i.wallet FROM payments p LEFT JOIN ton_invoices i ON i.payment_id=p.id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 100').all(user.id);}
 else if(path==='/api/payments/ton-transaction'&&write){
 if(!Number.isSafeInteger(b.id)||b.id<=0)fail('To‘lov raqamini tekshiring.');
 result=deposits.transaction(user,b.id);
 }
 else if(path==='/api/payments'&&write){
 deposits.expire();const amount=Number(b.amount);if(!Number.isFinite(amount)||amount<=0||amount>100000)fail('Summa noto‘g‘ri.');
 if(db.prepare("SELECT count(*) AS n FROM payments WHERE user_id=? AND status='pending'").get(user.id).n>=5)fail('Avval kutilayotgan to‘lovlarni yakunlang.',429);
 if(b.method==='ton'){result=deposits.create(user,amount);
 }else if(b.method==='crypto'){
 if(env.CRYPTO_MANUAL_ENABLED!=='true')fail('TON avtomatik hisobini yarating.',400);
 if(!env.CRYPTO_WALLET)fail('Kripto hamyon hali sozlanmagan.',503);
 let reference=String(b.reference||'').trim();if(/^[a-f0-9]{64}$/i.test(reference))reference=reference.toLowerCase();if(!/^([a-f0-9]{64}|[A-Za-z0-9_-]{43}=?)$/.test(reference))fail('TON tranzaksiya hashini kiriting.');
 if(db.prepare("SELECT id FROM payments WHERE method='crypto' AND reference=?").get(reference))fail('Bu tranzaksiya allaqachon yuborilgan.',409);const credit=Math.round(amount*1e6);if(credit<1)fail('Summa juda kichik.');try{const r=db.prepare("INSERT INTO payments(user_id,method,amount,credit,reference,created_at) VALUES(?,'crypto',?,?,?,?)").run(user.id,amount,credit,reference,now());result={id:Number(r.lastInsertRowid),status:'pending'}}catch(e){if(e.code?.includes('CONSTRAINT'))fail('Bu tranzaksiya allaqachon yuborilgan.',409);throw e}
 }else if(b.method==='stars'){
 if(!Number.isSafeInteger(amount)||amount>100000)fail('Stars summasi butun son bo‘lishi kerak.');if(!stars)fail('Stars kursi sozlanmagan.',503);
 const invoice='navo_'+randomBytes(20).toString('hex'),credit=stars.credit(amount);if(!Number.isSafeInteger(credit)||credit<1)fail('Summa juda kichik.');
 const r=db.prepare("INSERT INTO payments(user_id,method,amount,credit,invoice,created_at) VALUES(?,'stars',?,?,?,?)").run(user.id,amount,credit,invoice,now());
 try{const invoice_url=await telegram('createInvoiceLink',{title:'Navo Market balans',description:`Balans to‘ldirish: ${(credit/1e6).toFixed(6)} TON`,payload:invoice,currency:'XTR',provider_token:'',prices:[{label:'Balans to‘ldirish',amount}]});result={id:Number(r.lastInsertRowid),invoice_url}}catch(e){db.prepare("UPDATE payments SET status='rejected' WHERE id=?").run(r.lastInsertRowid);throw e}
 }else fail('To‘lov usuli noto‘g‘ri.');
 }else if(path==='/api/rent'&&write){expire();result=tx(()=>{const p=db.prepare('SELECT * FROM products WHERE id=? AND enabled=1').get(b.product_id);if(!p)fail('Aktiv topilmadi.',404);if(![1,3,7,14,30].includes(b.days))fail('Ijara muddati noto‘g‘ri.');if(db.prepare("SELECT id FROM rentals WHERE product_id=? AND status IN ('pending','active','returning')").get(p.id))fail('Aktiv hozir band.',409);const total=p.price*b.days;const debit=db.prepare('UPDATE users SET balance=balance-? WHERE id=? AND balance>=?').run(total,user.id,total);if(debit.changes!==1)fail('Balans yetarli emas. Hamyonni to‘ldiring.');const r=db.prepare('INSERT INTO rentals(user_id,product_id,days,total,created_at) VALUES(?,?,?,?,?)').run(user.id,p.id,b.days,total,now());return {id:Number(r.lastInsertRowid),balance:db.prepare('SELECT balance FROM users WHERE id=?').get(user.id).balance}})
 }else if(path==='/api/rentals'&&!write){expire();result=db.prepare('SELECT r.*,p.name FROM rentals r JOIN products p ON p.id=r.product_id WHERE user_id=? ORDER BY r.id DESC').all(user.id);result=[...await partner.history(user),...result]}
 else if(path==='/api/admin'&&!write)result={payments:db.prepare("SELECT p.*,u.name FROM payments p JOIN users u ON u.id=p.user_id WHERE p.status='pending' AND p.method='crypto'").all(),rentals:db.prepare("SELECT r.*,p.name FROM rentals r JOIN products p ON p.id=r.product_id WHERE r.status IN ('pending','returning')").all()};
 else if(path==='/api/admin/payments'&&write){if(typeof b.approve!=='boolean')fail('Qaror noto‘g‘ri.');paymentUpdate(b.id,b.approve);result={ok:true}}
 else if(path==='/api/admin/rentals'&&write){if(typeof b.deliver!=='boolean')fail('Qaror noto‘g‘ri.');tx(()=>{const r=db.prepare("SELECT * FROM rentals WHERE id=? AND status IN ('pending','returning')").get(b.id);if(!r)fail('Buyurtma allaqachon ko‘rib chiqilgan.',409);if(r.status==='returning'){if(!b.deliver)fail('Qaytarishni tasdiqlang.');db.prepare("UPDATE rentals SET status='expired' WHERE id=?").run(r.id)}else if(b.deliver)db.prepare("UPDATE rentals SET status='active',ends_at=? WHERE id=?").run(now()+r.days*86400,r.id);else{db.prepare("UPDATE rentals SET status='cancelled' WHERE id=?").run(r.id);db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(r.total,r.user_id)}});result={ok:true}}
 else if(path==='/api/admin/products'&&write){const price=Math.round(Number(b.price)*1e6);if(!b.name||String(b.name).length>70||!b.serial||String(b.serial).length>80||!['gift','username','number'].includes(b.kind)||!b.emoji||String(b.emoji).length>30||!/^#[0-9a-f]{6}$/i.test(b.color)||!Number.isSafeInteger(price)||price<=0||price>1e12)fail('Aktiv ma’lumotlarini tekshiring.');result={id:Number(db.prepare('INSERT INTO products(name,serial,kind,emoji,color,price) VALUES(?,?,?,?,?,?)').run(String(b.name),String(b.serial),b.kind,String(b.emoji),b.color,price).lastInsertRowid)}}
 else fail('Topilmadi.',404);
 }
 }else{
 if(req.method!=='GET'&&req.method!=='HEAD')fail('Usul topilmadi.',405);
 const artAsset=/^\/art\/(pepe|cap|heart|shard|bear|rose|ring|ball|ma-[A-Za-z0-9_-]{48})\.webp$/.test(path);const animation=/^\/motion\/[A-Za-z0-9_-]{48}\.tgs$/.test(path);const files={'/wallet-connect.js':['wallet-connect.js','text/javascript'],'/wallet-icon.png':['wallet-icon.png','image/png'],'/vendor/tonconnect-ui.js':['vendor/tonconnect-ui.js','text/javascript'],'/gift-motion.js':['gift-motion.js','text/javascript'],'/vendor/lottie.js':['vendor/lottie.js','text/javascript'],'/catalog.json':['catalog.json','application/json'],'/':['index.html','text/html; charset=utf-8'],'/market':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8']};const f=animation?[path.slice(1),'application/octet-stream']:artAsset?[path.slice(1),'image/webp']:files[path];if(!f)fail('Topilmadi.',404);const data=await readFile(root+'public/'+f[0]);res.writeHead(200,{'Content-Type':f[1],'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});return res.end(req.method==='HEAD'?undefined:data);
 }
 res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(result));
 }catch(e){res.writeHead(e.status||500,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:e.status?e.message:'Server xatosi. Qayta urinib ko‘ring.'}))}};
 const polling=setInterval(()=>{partner.reconcile().catch(()=>{});deposits.reconcile().catch(()=>console.error('TON reconciliation unavailable; retrying next cycle.'))},15000);polling.unref();
 return {handler,db,close:()=>{clearInterval(polling);deposits.close();db.close()}};
}
export function startServer(){
 try{process.loadEnvFile(root+'.env')}catch(error){if(error.code!=='ENOENT')throw error}
 const env=publicSettings(process.env);
 const app=makeApp({env,dbPath:env.DB_PATH||root+'navo.sqlite'});const server=http.createServer(app.handler);
 const port=Number(process.env.PORT || process.env.SERVER_PORT || 39292);
 server.on('close',()=>app.close());
 server.listen(port,'0.0.0.0',()=>{
  console.log(`Navo Market server ready on port ${server.address().port}`);
  void autoConfigureTelegram(env);
 });
 return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url))startServer();
