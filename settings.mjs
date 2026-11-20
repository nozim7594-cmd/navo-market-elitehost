// Public deployment settings. Secrets belong in EliteHost's environment or .env.
export function publicSettings(env=process.env){
 const defaults={BOT_USERNAME:'nft_renters_bot',PUBLIC_URL:'https://gift.novastax.uz',
  CRYPTO_WALLET:'UQBw7FOxJuXHLZqpFZQorwsmxOTflIbZgz_UJSwUuHt2ekd4',STARS_MICRO_TON_PER_STAR:'13000'};
 // Preserve explicitly configured legacy exchange rates.
 if(env.STARS_PER_TON?.trim()&&!env.STARS_MICRO_TON_PER_STAR?.trim())delete defaults.STARS_MICRO_TON_PER_STAR;
 return {...defaults,...Object.fromEntries(Object.entries(env).filter(([,v])=>v!==undefined&&v!==''))};
}
export function starsPricing(env){
 const value=env.STARS_MICRO_TON_PER_STAR;
 if(value!==undefined&&value!==''){
  const micro=Number(value);
  if(!Number.isSafeInteger(micro)||micro<=0||micro>1000000000)return null;
  return {microPerStar:micro,starsPerTon:1e6/micro,tonPer100:micro/10000,credit:amount=>amount*micro};
 }
 const rate=Number(env.STARS_PER_TON);
 if(!Number.isFinite(rate)||rate<=0)return null;
 return {microPerStar:null,starsPerTon:rate,tonPer100:Math.round(100/rate*1e6)/1e6,credit:amount=>Math.round(amount/rate*1e6)};
}
