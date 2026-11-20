import {test} from 'node:test';
import assert from 'node:assert/strict';
import {beginCell,loadMessageRelaxed,loadOutList,openContract,SendMode,WalletContractV4,WalletContractV5R1} from '@ton/ton';
import {mnemonicNew,mnemonicToPrivateKey,signVerify} from '@ton/crypto';
import {merchantSigner,merchantWallet} from '../marketapp.mjs';

// Ephemeral test keys stay in memory; no real wallet or network is used.
const words=await mnemonicNew();
const key=await mnemonicToPrivateKey(words);
for(const [name,Type] of [['V4R2',WalletContractV4],['W5',WalletContractV5R1]]){
 test(`${name} rental signing preserves the selected address, amount, payload and expiry`,async()=>{
  const expected=Type.create({workchain:0,publicKey:key.publicKey});
  const recipient=WalletContractV4.create({workchain:0,publicKey:Buffer.alloc(32,7)}).address;
  const payload=beginCell().storeUint(0,32).storeStringTail('rental test').endCell();
  let body,opened;
  const rpc={open:wallet=>{
   opened=wallet;
   return openContract(wallet,()=>({
    getState:async()=>({state:{type:'active'},balance:0n}),
    get:async method=>{assert.equal(method,'seqno');return {stack:{readNumber:()=>7}};},
    external:async message=>{assert.equal(body,undefined);body=message;}
   }));
  }};
  const send=await merchantSigner({MARKETAPP_WALLET_ADDRESS:expected.address.toString({bounceable:false}),MARKETAPP_WALLET_MNEMONIC:words.join(' ')},{rpc});
  assert.equal(body,undefined);assert.ok(opened instanceof Type);assert.ok(opened.address.equals(expected.address));
  await send({validUntil:2000000000,messages:[{address:recipient.toString({bounceable:false}),amount:'10000000',payload:payload.toBoc().toString('base64')}]});
  const slice=body.beginParse();let signature,signed;
  if(name==='V4R2'){
   signature=slice.loadBuffer(64);signed=slice.asCell();
  }else{
   const data=beginCell().storeBits(slice.loadBits(slice.remainingBits-512));
   signature=slice.loadBuffer(64);while(slice.remainingRefs)data.storeRef(slice.loadRef());
   signed=data.endCell();
  }
  assert.ok(signVerify(signed.hash(),signature,key.publicKey));
  const content=signed.beginParse();
  if(name==='W5')assert.equal(content.loadUint(32),0x7369676e); // signed external
  assert.equal(content.loadUint(32),name==='W5'?0x7fffff11:698983191);
  assert.equal(content.loadUint(32),2000000000);assert.equal(content.loadUint(32),7);
  let message,mode;
  if(name==='V4R2'){
   assert.equal(content.loadUint(8),0);mode=content.loadUint(8);message=loadMessageRelaxed(content.loadRef().beginParse());
  }else{
   const actions=loadOutList(content.loadMaybeRef().beginParse());
   assert.equal(content.loadBit(),false); // no extended actions
   assert.equal(actions.length,1);assert.equal(actions[0].type,'sendMsg');
   ({outMsg:message,mode}=actions[0]);
  }
  assert.equal(mode,name==='W5'?SendMode.PAY_GAS_SEPARATELY|SendMode.IGNORE_ERRORS:SendMode.PAY_GAS_SEPARATELY);
  assert.ok(message.info.dest.equals(recipient));assert.equal(message.info.value.coins,10000000n);
  assert.equal(message.info.bounce,false);assert.ok(message.body.equals(payload));
 });
}
test('wrong mnemonic, wrong address and testnet wallet never reach RPC or signing',async()=>{
 const address=WalletContractV4.create({workchain:0,publicKey:key.publicKey}).address;
 const rpc={open:()=>assert.fail('RPC must not be opened')};
 await assert.rejects(merchantSigner({MARKETAPP_WALLET_MNEMONIC:'invalid words',MARKETAPP_WALLET_ADDRESS:address.toString()},{rpc}),/tiklash iborasini/);
 assert.throws(()=>merchantWallet(key.publicKey,address.toString({testOnly:true})),/Mainnet/);
 assert.throws(()=>merchantWallet(key.publicKey,'invalid'),/Mainnet/);
 const other=WalletContractV4.create({workchain:0,publicKey:Buffer.alloc(32,7)}).address.toString();
 await assert.rejects(merchantSigner({MARKETAPP_WALLET_MNEMONIC:words.join(' '),MARKETAPP_WALLET_ADDRESS:other},{rpc}),/mos emas/);
 const testnet=WalletContractV5R1.create({publicKey:key.publicKey,walletId:{networkGlobalId:-3}});
 assert.throws(()=>merchantWallet(key.publicKey,testnet.address.toString()),/mos emas/);
});
