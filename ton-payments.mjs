import {randomBytes} from 'node:crypto';
import {Address,TonClient,beginCell} from '@ton/ton';

// Only the public deposit address is needed. This module never signs transfers.
export function tonPayments({db,tx,env,client,clock=()=>Math.floor(Date.now()/1000)}) {
 db.exec(`CREATE TABLE IF NOT EXISTS ton_invoices(payment_id INTEGER PRIMARY KEY REFERENCES payments(id),memo TEXT NOT NULL UNIQUE,wallet TEXT NOT NULL,nano TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS ton_scan(wallet TEXT PRIMARY KEY,watermark TEXT NOT NULL DEFAULT '0',cursor_lt TEXT,cursor_hash TEXT,top_lt TEXT);`);
 function currentAddress(){
  try {
   if(Address.isFriendly(env.CRYPTO_WALLET||'')&&Address.parseFriendly(env.CRYPTO_WALLET).isTestOnly)return null;
   return Address.parse(env.CRYPTO_WALLET);
  }catch{return null}
 }
 const enabled=()=>Boolean(currentAddress()&&env.TON_AUTO_PAYMENTS==='true'&&env.TONCENTER_API_KEY);
 const rpc=client||new TonClient({endpoint:'https://toncenter.com/api/v2/jsonRPC',apiKey:env.TONCENTER_API_KEY,timeout:12000});
 let running=false,closed=false;
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
 function expire(){db.prepare("UPDATE payments SET status='expired' WHERE method='ton' AND status='pending' AND id IN (SELECT payment_id FROM ton_invoices WHERE expires_at<?)").run(clock())}
 function create(user,amount){
  const address=currentAddress(),wallet=address?.toRawString();
  if(!enabled())fail('TON avtomatik to‘lovlari hali sozlanmagan.',503);
  if(!Number.isFinite(amount)||amount<0.01||amount>10000)fail('0.01–10000 TON oralig‘ida summa kiriting.');
  const micro=Math.round(amount*1e6);
  if(Math.abs(micro/1e6-amount)>1e-10)fail('Ko‘pi bilan 6 ta kasr raqami kiriting.');
  const nano=String(BigInt(micro)*1000n),memo='navo_'+randomBytes(16).toString('hex'),expires=clock()+1800;
  return tx(()=>{
   const id=Number(db.prepare("INSERT INTO payments(user_id,method,amount,credit,reference,created_at) VALUES(?,'ton',?,?,?,?)").run(user.id,micro/1e6,micro,memo,clock()).lastInsertRowid);
   db.prepare('INSERT INTO ton_invoices VALUES(?,?,?,?,?)').run(id,memo,wallet,nano,expires);
   return {id,status:'pending',memo,amount:micro/1e6,wallet:address.toString({bounceable:false}),expires_at:expires,transfer_url:'ton://transfer/'+address.toString({bounceable:false})+'?'+new URLSearchParams({amount:nano,text:memo})};
  });
 }
 function transaction(user,id){
  if(!enabled())fail('TON avtomatik to‘lovlari hali sozlanmagan.',503);
  expire();
  const p=db.prepare('SELECT p.status,i.* FROM payments p JOIN ton_invoices i ON i.payment_id=p.id WHERE p.id=? AND p.user_id=?').get(id,user.id);
  if(!p)fail('To‘lov topilmadi.',404);
  if(p.status!=='pending'||p.expires_at<=clock())fail('Bu hisob yopilgan. To‘lov holatini yangilang.',409);
  return {network:'-239',validUntil:Math.min(clock()+300,p.expires_at),messages:[{
   address:Address.parse(p.wallet).toString({bounceable:false}),amount:p.nano,
   payload:beginCell().storeUint(0,32).storeStringTail(p.memo).endCell().toBoc().toString('base64')
  }]};
 }
 function receive(t,address){
  const wallet=address.toRawString();
  if(t.now>clock()-60||t.description?.type!=='generic'||t.description.aborted!==false)return;
  const m=t.inMessage;
  if(m?.info.type!=='internal'||m.info.bounced||!m.info.dest.equals(address))return;
  let memo;try{const b=m.body.beginParse();if(b.loadUint(32)!==0)return;memo=b.loadStringTail();if(!/^navo_[a-f0-9]{32}$/.test(memo))return}catch{return}
  const invoice=db.prepare('SELECT p.*,i.nano,i.wallet FROM payments p JOIN ton_invoices i ON p.id=i.payment_id WHERE i.memo=?').get(memo);
  if(!invoice||invoice.wallet!==wallet||!['pending','expired'].includes(invoice.status)||t.now<invoice.created_at-30||m.info.value.coins!==BigInt(invoice.nano))return;
  const charge='ton:'+t.hash().toString('hex');
  tx(()=>{
   if(db.prepare('SELECT id FROM payments WHERE charge=?').get(charge))return;
   const updated=db.prepare("UPDATE payments SET status='approved',charge=? WHERE id=? AND status IN ('pending','expired')").run(charge,invoice.id);
   if(updated.changes)db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(invoice.credit,invoice.user_id);
  });
 }
 async function scanWallet(wallet){
   const address=Address.parse(wallet);
   const oldest=db.prepare('SELECT min(p.created_at) AS t FROM payments p JOIN ton_invoices i ON p.id=i.payment_id WHERE i.wallet=?').get(wallet).t;
   if(oldest===null)return;
   db.prepare('INSERT OR IGNORE INTO ton_scan(wallet) VALUES(?)').run(wallet);
   const s=db.prepare('SELECT * FROM ton_scan WHERE wallet=?').get(wallet);
   const rows=await rpc.getTransactions(address,{limit:100,archival:true,...(s.cursor_lt?{lt:s.cursor_lt,hash:s.cursor_hash,inclusive:false}:{})});
   if(closed)return;
   let top=BigInt(s.top_lt||s.watermark),done=rows.length<100;
   for(const t of rows){
    if(t.lt<=BigInt(s.watermark)||t.now<oldest-30){done=true;break}
    if(t.now>clock()-60)continue;
    if(t.lt>top)top=t.lt;
    receive(t,address);
   }
   const last=rows.at(-1);
   if(done)db.prepare('UPDATE ton_scan SET watermark=?,cursor_lt=NULL,cursor_hash=NULL,top_lt=NULL WHERE wallet=?').run(String(top),wallet);
   else db.prepare('UPDATE ton_scan SET cursor_lt=?,cursor_hash=?,top_lt=? WHERE wallet=?').run(String(last.lt),last.hash().toString('base64'),String(top),wallet);
 }
 async function reconcile(){
  if(!env.TONCENTER_API_KEY||running||closed)return;
  running=true;
  try {
   expire();
   const wallets=db.prepare('SELECT DISTINCT wallet FROM ton_invoices').all();
   let failure;
   for(const {wallet} of wallets){
    if(closed)return;
    try{await scanWallet(wallet)}catch(error){failure=error}
   }
   if(failure)throw failure;
  }finally{running=false}
 }
 return {get enabled(){return enabled()},create,transaction,expire,reconcile,close:()=>{closed=true}};
}
