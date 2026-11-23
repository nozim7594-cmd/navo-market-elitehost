import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeApp} from '../server.mjs';
import {walletSettings} from '../wallet-settings.mjs';

test('wallet settings persist, audit changes and block rotation during rental settlement', async t => {
 const app = makeApp({dbPath:':memory:',env:{}});
 t.after(() => app.close());
 const db = app.db;
 const tx = fn => {
  db.exec('BEGIN IMMEDIATE');
  try { const result=fn();db.exec('COMMIT');return result; }
  catch(error) {db.exec('ROLLBACK');throw error;}
 };
 const env={CRYPTO_WALLET:'0:'+'1'.repeat(64)};
 const wallet=walletSettings({db,tx,env,validateSigner:async()=>{}});
 const saved=await wallet.save(99,{deposit_address:'0:'+'2'.repeat(64),rental_address:'0:'+'3'.repeat(64),revision:0});
 assert.equal(saved.history[0].admin_id,99);
 const restartedEnv={CRYPTO_WALLET:'old environment value'};
 const restarted=walletSettings({db,tx,env:restartedEnv});
 assert.equal(restarted.snapshot().deposit_address,saved.deposit_address);
 assert.equal(restartedEnv.MARKETAPP_WALLET_ADDRESS,saved.rental_address);
 db.prepare("INSERT INTO users(id,name) VALUES(12,'Test')").run();
 db.prepare("INSERT INTO marketapp_orders(id,user_id,address,name,days,total,state,deadline,created) VALUES('order',12,'asset','Gift',1,1,'checking',0,0)").run();
 await assert.rejects(()=>wallet.save(99,{...saved,rental_address:'0:'+'4'.repeat(64)}),{status:409});
 assert.equal(wallet.snapshot().rental_address,saved.rental_address);
});
