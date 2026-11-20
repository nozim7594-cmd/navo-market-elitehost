import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Address,beginCell} from '@ton/ton';
import {makeApp} from '../server.mjs';
import {tonPayments} from '../ton-payments.mjs';
const address=Address.parse('0:'+ '1'.repeat(64));
const other=Address.parse('0:'+ '2'.repeat(64));
function fixture(t){
 const app=makeApp({dbPath:':memory:',env:{}}),db=app.db;t.after(()=>app.close());
 db.prepare("INSERT INTO users(id,name) VALUES(12,'Test')").run();
 const state={now:1000,rows:[],fail:false,calls:[]};
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}catch(e){db.exec('ROLLBACK');throw e}};
 const client={async getTransactions(a,opts){state.calls.push(opts);if(state.fail)throw Error('offline');return state.rows.filter(r=>!opts.lt||r.lt<BigInt(opts.lt)).slice(0,opts.limit)}};
 const env={CRYPTO_WALLET:address.toString(),TON_AUTO_PAYMENTS:'true',TONCENTER_API_KEY:'test-only'};
 const newProcessor=()=>tonPayments({db,tx,env,client,clock:()=>state.now});
 return {db,state,newProcessor,deposits:newProcessor(),balance:()=>db.prepare('SELECT balance FROM users WHERE id=12').get().balance};
}
function transaction(invoice,{id=1,now=1010,amount=1000000000n,dest=address,bounced=false,aborted=false,memo=invoice.memo}={}){
 return {lt:BigInt(id),now,hash:()=>createHash('sha256').update(String(id)).digest(),description:{type:'generic',aborted},inMessage:{info:{type:'internal',bounced,dest,value:{coins:amount}},body:beginCell().storeUint(0,32).storeStringTail(memo).endCell()}};
}
test('TON requires successful exact transfer; credits once even after processor restart',async t=>{
 const f=fixture(t),invoice=f.deposits.create({id:12},1);assert.equal(f.balance(),0);
 f.state.now=1100;
 f.state.rows=[transaction(invoice,{id:6,memo:'navo_'+'f'.repeat(32)}),transaction(invoice,{id:5,amount:999999999n}),transaction(invoice,{id:4,dest:other}),transaction(invoice,{id:3,bounced:true}),transaction(invoice,{id:2,aborted:true})];
 await f.deposits.reconcile();assert.equal(f.balance(),0);
 f.state.rows.unshift(transaction(invoice,{id:7}));await f.deposits.reconcile();assert.equal(f.balance(),1000000);
 f.state.rows.unshift(transaction(invoice,{id:8}));await f.newProcessor().reconcile();assert.equal(f.balance(),1000000);
 assert.equal(f.db.prepare('SELECT status FROM payments WHERE id=?').get(invoice.id).status,'approved');
});
test('TON waits for settlement, accepts late payment on expired invoice and survives RPC outage',async t=>{
 const f=fixture(t),invoice=f.deposits.create({id:12},1);f.state.rows=[transaction(invoice)];f.state.now=1020;
 await f.deposits.reconcile();assert.equal(f.balance(),0);
 f.state.now=3000;f.deposits.expire();assert.equal(f.db.prepare('SELECT status FROM payments').get().status,'expired');
 f.state.fail=true;await assert.rejects(()=>f.deposits.reconcile());assert.equal(f.balance(),0);
 f.state.fail=false;await f.newProcessor().reconcile();assert.equal(f.balance(),1000000);
});
test('TON resumes archived pages after restart and then catches newer payments',async t=>{
 const f=fixture(t),invoice=f.deposits.create({id:12},1);f.state.now=1200;
 f.state.rows=Array.from({length:101},(_,i)=>transaction(invoice,{id:101-i,memo:i===100?invoice.memo:'navo_'+'e'.repeat(32)}));
 await f.deposits.reconcile();assert.equal(f.balance(),0);assert.ok(f.db.prepare('SELECT cursor_lt FROM ton_scan').get().cursor_lt);
 await f.newProcessor().reconcile();assert.equal(f.balance(),1000000);assert.equal(f.db.prepare('SELECT cursor_lt FROM ton_scan').get().cursor_lt,null);
 const second=f.deposits.create({id:12},1);f.state.now=1300;f.state.rows.unshift(transaction(second,{id:102,now:1210}));
 await f.deposits.reconcile();assert.equal(f.balance(),2000000);
});
test('TON rejects unsupported precision and amounts before creating an invoice',t=>{
 const f=fixture(t);for(const value of [0,-1,.001,1.0000001,10001,NaN,Infinity])assert.throws(()=>f.deposits.create({id:12},value));
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM payments').get().n,0);
});
