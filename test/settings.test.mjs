import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicSettings,starsPricing} from '../settings.mjs';
test('public defaults use the selected rate while explicit hosting settings take precedence',()=>{
 assert.equal(publicSettings({}).BOT_USERNAME,'nft_renters_bot');
 assert.equal(starsPricing(publicSettings({})).credit(100),1300000);
 assert.equal(starsPricing(publicSettings({STARS_PER_TON:'100'})).credit(100),1000000);
 assert.equal(starsPricing(publicSettings({STARS_PER_TON:'100',STARS_MICRO_TON_PER_STAR:'13000'})).credit(100),1300000);
 assert.equal(starsPricing({STARS_MICRO_TON_PER_STAR:'invalid'}),null);
 assert.equal(starsPricing({STARS_MICRO_TON_PER_STAR:'0'}),null);
});
