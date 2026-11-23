// Durable, deduplicated customer notifications. A failed Telegram call is retried later.
export function notifications({db,env,send,clock=()=>Math.floor(Date.now()/1000)}){
 const fresh=!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='notification_outbox'").get();
 db.exec(`CREATE TABLE IF NOT EXISTS notification_outbox(key TEXT PRIMARY KEY,user_id INTEGER NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL,sent_at INTEGER,attempts INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0);`);
 // A deployment must not send old payment receipts again.
 if(fresh){
  const stamp=clock();
  db.prepare("INSERT OR IGNORE INTO notification_outbox(key,user_id,text,created_at,sent_at) SELECT 'payment:'||id,user_id,'',?,? FROM payments WHERE status='approved'").run(stamp,stamp);
  db.prepare("INSERT OR IGNORE INTO notification_outbox(key,user_id,text,created_at,sent_at) SELECT 'rental-active:'||id,user_id,'',?,? FROM marketapp_orders WHERE state='active'").run(stamp,stamp);
  db.prepare("INSERT OR IGNORE INTO notification_outbox(key,user_id,text,created_at,sent_at) SELECT 'rental-link:'||id,user_id,'',?,? FROM marketapp_orders WHERE state='needs_link'").run(stamp,stamp);
 }

 let busy=false;
 const origin=env.PUBLIC_URL||'https://gift.novastax.uz';
 function enqueue(key,userId,message){db.prepare('INSERT OR IGNORE INTO notification_outbox(key,user_id,text,created_at) VALUES(?,?,?,?)').run(key,userId,message,clock())}
 async function run(){
  if(busy||!env.BOT_TOKEN)return;busy=true;
  try{
   for(const p of db.prepare("SELECT id,user_id,method,credit FROM payments WHERE status='approved' ORDER BY id DESC LIMIT 1000").all())enqueue('payment:'+p.id,p.user_id,`✅ Balansingiz ${(p.credit/1e6).toFixed(6)} TON ga to‘ldirildi.`);
   for(const r of db.prepare("SELECT id,user_id,name,state,ends_at FROM marketapp_orders WHERE state IN ('active','needs_link') ORDER BY created DESC LIMIT 100").all()){
    if(r.state==='active'){
     enqueue('rental-active:'+r.id,r.user_id,`🎁 ${r.name} ijarasi boshlandi. Ijaralarim bo‘limida ko‘ring.`);
     if(r.ends_at>clock()&&r.ends_at<=clock()+86400)enqueue('rental-reminder:'+r.id,r.user_id,`⏳ ${r.name} ijarasi 24 soat ichida tugaydi.`);
    }else enqueue('rental-link:'+r.id,r.user_id,`🔗 ${r.name} uchun yangi Fragment havolasi kerak. Ijaralarim bo‘limini oching.`);
   }
   for(const n of db.prepare('SELECT * FROM notification_outbox WHERE sent_at IS NULL AND retry_at<=? ORDER BY created_at LIMIT 20').all(clock())){
    try{
     await send('sendMessage',{chat_id:n.user_id,text:n.text,reply_markup:{inline_keyboard:[[{text:'Ilovani ochish',web_app:{url:origin}}]]}});
     db.prepare('UPDATE notification_outbox SET sent_at=? WHERE key=? AND sent_at IS NULL').run(clock(),n.key);
    }catch{db.prepare('UPDATE notification_outbox SET attempts=attempts+1,retry_at=? WHERE key=?').run(clock()+Math.min(3600,15*2**Math.min(n.attempts,8)),n.key)}
   }
  }finally{busy=false}
 }
 return {run,enqueue};
}
