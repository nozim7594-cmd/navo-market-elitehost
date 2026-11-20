import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {partnerMarket} from '../marketapp.mjs';

function setup(unknown=false) {
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,balance INTEGER); INSERT INTO users VALUES(1,1000000)');
  const tx=fn=>{db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};
  const address='EQ'+'a'.repeat(46),calls={sign:0,connect:0},now=()=>Math.floor(Date.now()/1000);
  let onchain=false;
  const env={MARKETAPP_API_TOKEN:'test',MARKETAPP_WALLET_MNEMONIC:'fixture',MARKETAPP_WALLET_ADDRESS:'fixture',MARKETAPP_NETWORK_RESERVE_NANO:'1000000'};
  const api=async(url,opts)=>{
    assert.equal(opts.headers.Authorization,'test');
    const path=new URL(url).pathname;
    if(path==='/v1/rent/gifts/')return Response.json({items:[{nft_address:address,nft_name:'Test #1',price_per_day:'40000000',min_duration:86400,max_duration:259200}],cursor:null});
    if(path.endsWith('/pay/')){
      assert.deepEqual(JSON.parse(opts.body),{duration:172800,price_per_day:'40000000',sale_during_rent:false});
      return Response.json({transaction:{validUntil:now()+100,messages:[{address,amount:'85000000'}]}});
    }
    if(path.endsWith('/my-rented/'))return Response.json({items:onchain?[{nft_address:address,duration:172800,end_time:now()+172800}]:[]});
    if(path.endsWith('/tonconnect/')){calls.connect++;return Response.json({success:true})}
    throw Error(path);
  };
  const partner=partnerMarket({db,tx,env,request:api,signer:async()=>async()=>{calls.sign++;if(unknown)throw Error('ambiguous confirmation')}});
  return {partner,db,calls,confirm:()=>onchain=true};
}
for(const uncertain of [false,true])test('MarketApp checkout and delivery, ambiguous broadcast = '+uncertain,async()=>{
  const {partner,db,calls,confirm}=setup(uncertain),user={id:1};
  const [item]=await partner.catalog();assert.equal(item.price,.044);
  await assert.rejects(partner.quote(user,{product_id:item.id,days:4}));
  const quote=await partner.quote(user,{product_id:item.id,days:2});assert.equal(quote.total_micro,94600);
  const args={quote_id:quote.id,link:'https://app.tonkeeper.com/ton-connect?v=2&id=fixture'};
  await assert.rejects(partner.rent({id:2},args));await partner.rent(user,args);await partner.rent(user,args);
  assert.equal(calls.sign,1);assert.equal(db.prepare('SELECT balance FROM users').get().balance,905400);
  await partner.reconcile();assert.equal(calls.connect,0);assert.equal(partner.history(user)[0].status,'checking');
  confirm();await partner.reconcile();await partner.reconcile();assert.equal(calls.connect,1);assert.equal(partner.history(user)[0].status,'active');db.close();
});
