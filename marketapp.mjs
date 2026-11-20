import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Address,Cell,loadStateInit,internal,SendMode,TonClient,WalletContractV4} from '@ton/ton';
import {mnemonicToPrivateKey} from '@ton/crypto';

const apiOrigin='https://api.marketapp.org/v1/rent/';
const snapshot=JSON.parse(readFileSync(new URL('./public/catalog.json',import.meta.url)));
const pictures=new Map(snapshot.map(p=>[p.address,p.image]));
const clock=()=>Math.floor(Date.now()/1000);
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status})};
const idFor=address=>-parseInt(createHash('sha256').update(address).digest('hex').slice(0,12),16);

export async function merchantSigner(env) {
  const key=await mnemonicToPrivateKey(env.MARKETAPP_WALLET_MNEMONIC.trim().split(/\s+/));
  const wallet=WalletContractV4.create({workchain:0,publicKey:key.publicKey});
  if(!wallet.address.equals(Address.parse(env.MARKETAPP_WALLET_ADDRESS)))fail('API hamyoni sozlamalarini tekshiring.',503);
  const rpc=new TonClient({endpoint:'https://toncenter.com/api/v2/jsonRPC',apiKey:env.TONCENTER_API_KEY});
  const contract=rpc.open(wallet);
  return async transaction=>{
    const messages=transaction.messages.map(m=>internal({
      to:Address.parse(m.address),value:BigInt(m.amount),bounce:Address.isFriendly(m.address)?Address.parseFriendly(m.address).isBounceable:true,
      body:m.payload?Cell.fromBase64(m.payload):undefined,
      init:m.stateInit?loadStateInit(Cell.fromBase64(m.stateInit).beginParse()):undefined
    }));
    await contract.sendTransfer({seqno:await contract.getSeqno(),secretKey:key.secretKey,
      timeout:transaction.validUntil,messages,sendMode:SendMode.PAY_GAS_SEPARATELY});
  };
}

export function partnerMarket({db,tx,env,request=fetch,signer=merchantSigner}) {
  db.exec(`CREATE TABLE IF NOT EXISTS marketapp_orders(
    id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),address TEXT NOT NULL,name TEXT NOT NULL,
    days INTEGER NOT NULL,total INTEGER NOT NULL,state TEXT NOT NULL,deadline INTEGER NOT NULL,
    chain_tx TEXT,link TEXT,ends_at INTEGER,created INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS marketapp_asset_reserved ON marketapp_orders(address)
    WHERE state IN ('sending','checking','connecting','needs_link','active');`);
  let cache,catalogPending,working=false;
  const markup=Number(env.MARKETAPP_MARKUP_PERCENT||10);
  const reserve=Number(env.MARKETAPP_NETWORK_RESERVE_NANO);
  const billingReady=Boolean(env.MARKETAPP_API_TOKEN&&env.MARKETAPP_WALLET_ADDRESS&&env.MARKETAPP_WALLET_MNEMONIC&&Number.isSafeInteger(reserve)&&reserve>0);
  if(!Number.isInteger(markup)||markup<=0||markup>100)throw Error('Invalid MARKETAPP_MARKUP_PERCENT');
  async function call(path,body) {
    if(!env.MARKETAPP_API_TOKEN)fail('MarketApp API hali ulanmagan.',503);
    const res=await request(apiOrigin+path,{method:body?'POST':'GET',headers:{Authorization:env.MARKETAPP_API_TOKEN,'Content-Type':'application/json'},
      body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(12000)});
    if(!res.ok)fail('MarketApp so‘rovni qabul qilmadi.',503);
    return res.json();
  }
  async function pages(path,count,until) {
    let cursor;const rows=[],seen=new Set();
    for(let i=0;i<count;i++){
      const q=new URLSearchParams({limit:'100'});if(cursor)q.set('cursor',cursor);
      const data=await call(path+'?'+q);
      if(!Array.isArray(data.items))fail('MarketApp javobi noto‘g‘ri.',502);
      rows.push(...data.items);if(until?.(rows)||!data.cursor||seen.has(data.cursor))break;
      cursor=data.cursor;seen.add(cursor);
    }
    return rows;
  }
  function shape(n) {
    if(!/^[-_A-Za-z0-9]{48}$/.test(n.nft_address)||!/^\d{1,15}$/.test(n.price_per_day)||Number(n.price_per_day)<=0||n.is_sellable_during_rent)return null;
    const minDays=Math.max(1,Math.ceil(n.min_duration/86400)),maxDays=Math.floor(n.max_duration/86400);
    if(!Number.isSafeInteger(maxDays)||!Number.isSafeInteger(minDays)||minDays>maxDays)return null;
    const slug=String(n.nft_name).match(/^([a-z ’'\-]+?)\s*#(\d+)$/i);
    const model=n.attributes?.find(a=>a.trait_type==='Model')?.value;
    const motion=slug&&typeof model==='string'&&model.length<100?'https://cdn.changes.tg/gifts/models/'+encodeURIComponent(slug[1].trim().replaceAll('’',"'"))+'/'+encodeURIComponent(model)+'.tgs':undefined;
    const image=pictures.get(n.nft_address)||(slug?'https://nft.fragment.com/gift/'+slug[1].toLowerCase().replace(/[^a-z]/g,'')+'-'+slug[2]+'.webp':null);
    return {id:idFor(n.nft_address),address:n.nft_address,name:n.nft_name,kind:'gift',serial:'MarketApp',
      source:'marketapp',price:Number(BigInt(n.price_per_day)*BigInt(100+markup))/1e11,
      baseNano:n.price_per_day,currency:'TON',minDays,maxDays,available:true,color:'#655475',image,motion};
  }
  async function catalog(fresh=false) {
    if(!env.MARKETAPP_API_TOKEN)return [];
    if(!fresh&&cache?.until>Date.now())return cache.rows;
    if(catalogPending)return catalogPending;
    catalogPending=(async()=>{
      const rows=(await pages('gifts/',Math.min(10,Math.max(1,Number(env.MARKETAPP_CATALOG_PAGES)||10)))).map(shape).filter(Boolean);
      cache={until:Date.now()+30000,rows};return rows;
    })();
    try{return await catalogPending}finally{catalogPending=null}
  }
  async function quote(user,b) {
    if(!billingReady)fail('Hamyonga ulanish hali sozlanmagan.',503);
    const item=(await catalog(true)).find(p=>p.id===b.product_id);
    if(!item||!Number.isSafeInteger(b.days)||b.days<item.minDays||b.days>item.maxDays)fail('NFT yoki muddat o‘zgargan.');
    const {transaction:t}=await call(encodeURIComponent(item.address)+'/pay/',{duration:b.days*86400,price_per_day:item.baseNano,sale_during_rent:false});
    if(!Array.isArray(t?.messages)||!t.messages.length||t.messages.length>4||!Number.isSafeInteger(t.validUntil)||t.validUntil<=clock()+5)fail('Tranzaksiya eskirgan.');
    let nano=BigInt(reserve);
    for(const m of t.messages){if(!/^\d{1,18}$/.test(m.amount))fail('Tranzaksiya narxi noto‘g‘ri.');nano+=BigInt(m.amount);}
    const floor=BigInt(item.baseNano)*BigInt(b.days);
    const micro=((nano>floor?nano:floor)*BigInt(100+markup)+99999n)/100000n;
    if(micro<=0n||micro>BigInt(Number.MAX_SAFE_INTEGER))fail('Narx noto‘g‘ri.');
    const id=randomUUID(),deadline=Math.min(clock()+90,t.validUntil-5);
    db.prepare("DELETE FROM marketapp_orders WHERE state='quote' AND deadline<=?").run(clock());
    db.prepare("INSERT INTO marketapp_orders VALUES(?,?,?,?,?,?,'quote',?,?,NULL,NULL,?)").run(id,user.id,item.address,item.name,b.days,Number(micro),deadline,JSON.stringify(t),clock());
    return {id,total_micro:Number(micro),deadline};
  }
  function validateLink(value){
    let url;try{url=new URL(value)}catch{fail('Fragment havolasini tekshiring.',400)}
    if(url.origin!=='https://app.tonkeeper.com'||url.username||url.password||url.pathname!=='/ton-connect'||url.searchParams.get('v')!=='2'||!url.searchParams.get('id'))fail('Tonkeeper havolasini tekshiring.',400);
    return url.href;
  }
  async function rent(user,b){
    if(!billingReady)fail('Hamyonga ulanish hali sozlanmagan.',503);
    const link=validateLink(b.link);
    const row=db.prepare('SELECT * FROM marketapp_orders WHERE id=? AND user_id=?').get(b.quote_id,user.id);
    if(!row)fail('Buyurtma topilmadi.',404);
    if(row.state!=='quote')return {id:row.id,state:row.state};
    const send=await signer(env);
    tx(()=>{
      if(row.deadline<=clock()||!db.prepare("UPDATE marketapp_orders SET state='sending',link=? WHERE id=? AND state='quote'").run(link,row.id).changes)fail('Narxni qayta tekshiring.');
      if(db.prepare("SELECT 1 FROM marketapp_orders WHERE id!=? AND state IN ('sending','checking')").get(row.id))fail('Hamyon band. Qayta urinib ko‘ring.');
      if(!db.prepare('UPDATE users SET balance=balance-? WHERE id=? AND balance>=?').run(row.total,user.id,row.total).changes)fail('Balans yetarli emas.');
    });
    try{await send(JSON.parse(row.chain_tx));}catch{/* Submission may already have reached the network. Never resend automatically. */}
    db.prepare("UPDATE marketapp_orders SET state='checking',chain_tx=NULL WHERE id=?").run(row.id);
    cache=null;return {id:row.id,state:'checking'};
  }
  async function reconcile(){
    if(working||!env.MARKETAPP_API_TOKEN)return;working=true;
    try{
      db.prepare("UPDATE marketapp_orders SET state='completed',link=NULL WHERE state IN ('active','needs_link','connecting') AND ends_at<=?").run(clock());
      const pending=db.prepare("SELECT * FROM marketapp_orders WHERE state IN ('checking','connecting') OR (state='sending' AND created<?)").all(clock()-120);
      if(!pending.length)return;
      const rented=await pages('my-rented/',10);
      for(const r of pending){
        const asset=rented.find(a=>a.nft_address===r.address&&a.duration===r.days*86400&&a.end_time>clock()&&a.end_time-a.duration>=r.created-60);
        if(!asset)continue;
        db.prepare("UPDATE marketapp_orders SET state='connecting',ends_at=? WHERE id=?").run(asset.end_time,r.id);
        try{
          const result=await call(r.address+'/tonconnect/',{tonconnect_url:r.link});
          if(result?.ok===false||result?.success===false||result?.error)throw Error();
          db.prepare("UPDATE marketapp_orders SET state='active',link=NULL WHERE id=?").run(r.id);
        }catch{db.prepare("UPDATE marketapp_orders SET state='needs_link',link=NULL WHERE id=?").run(r.id);}
      }
    }finally{working=false}
  }
  function reconnect(user,b){
    const link=validateLink(b.link);
    if(!db.prepare("UPDATE marketapp_orders SET state='connecting',link=? WHERE user_id=? AND id=? AND state='needs_link' AND ends_at>?").run(link,user.id,b.id,clock()).changes)fail('Buyurtma topilmadi.');
    return {ok:true};
  }
  function history(user){
    const rows=db.prepare("SELECT id,name,days,total,state AS status,ends_at FROM marketapp_orders WHERE user_id=? AND state!='quote' ORDER BY created DESC").all(user.id);
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='partner_orders'").get()){
      rows.push(...db.prepare("SELECT id,name,days,total,state AS status,NULL AS ends_at FROM partner_orders WHERE user_id=? ORDER BY id DESC").all(user.id));
    }
    return rows;
  }
  return {catalog,quote,rent,reconnect,reconcile,history,billingReady};
}
