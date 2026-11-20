import {access,mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {merchantSigner} from '../marketapp.mjs';

const env=process.env;
const missing=['BOT_TOKEN','BOT_USERNAME','ADMIN_IDS','TELEGRAM_WEBHOOK_SECRET','PUBLIC_URL',
  'DB_PATH','CRYPTO_WALLET','STARS_PER_TON','MARKETAPP_API_TOKEN','MARKETAPP_WALLET_ADDRESS',
  'MARKETAPP_WALLET_MNEMONIC','MARKETAPP_NETWORK_RESERVE_NANO'].filter(key=>!env[key]?.trim());
if(missing.length)throw Error('Set these hosting variables: '+missing.join(', '));
if(!/^[1-9]\d*(\s*,\s*[1-9]\d*)*$/.test(env.ADMIN_IDS) ||
   !/^[a-zA-Z0-9_-]{32,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET) ||
   !(Number(env.STARS_PER_TON)>0) || !Number.isSafeInteger(Number(env.MARKETAPP_NETWORK_RESERVE_NANO)) ||
   Number(env.MARKETAPP_NETWORK_RESERVE_NANO)<=0) throw Error('Check admin IDs, webhook secret, Stars rate and network reserve.');
const url=new URL(env.PUBLIC_URL);
if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('PUBLIC_URL must be the public HTTPS origin of this backend.');
const dir=dirname(resolve(env.DB_PATH));await mkdir(dir,{recursive:true});await access(dir,constants.W_OK);
await merchantSigner(env);
const options={redirect:'error',signal:AbortSignal.timeout(12000)};
const health=await fetch(url.origin+'/healthz',options);
if(!health.ok||(await health.json()).service!=='navo-market')throw Error('Public proxy does not reach this Navo backend.');
const tg=await fetch('https://api.telegram.org/bot'+env.BOT_TOKEN+'/getMe',options).then(r=>r.json());
if(!tg.ok||tg.result?.username?.toLowerCase()!==env.BOT_USERNAME.replace(/^@/,'').toLowerCase())throw Error('BOT_USERNAME does not match BOT_TOKEN.');
const feed=await fetch('https://api.marketapp.org/v1/rent/gifts/?limit=1',{...options,headers:{Authorization:env.MARKETAPP_API_TOKEN}});
if(!feed.ok||!Array.isArray((await feed.json()).items))throw Error('MarketApp token did not return the gift catalog.');
console.log('HTTPS backend, database directory, bot identity, signer address and catalog access verified. No transaction submitted.');
