let pending;
export function walletConnector(){
 if(pending)return pending;
 pending=(async()=>{
  if(!window.TON_CONNECT_UI)await new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='/vendor/tonconnect-ui.js';
   script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('Hamyon xizmatini yuklab bo‘lmadi.'));};
   document.head.append(script);
  });
  const ui=new window.TON_CONNECT_UI.TonConnectUI({
   manifestUrl:new URL('/tonconnect-manifest.json',location.origin).href,
   uiPreferences:{theme:window.TON_CONNECT_UI.THEME.DARK},language:'en',
   actionsConfiguration:{twaReturnUrl:'https://t.me/nft_renters_bot',notifications:['error'],modals:['before']}
  });
  ui.onStatusChange(()=>window.dispatchEvent(new Event('navo-wallet-change')));
  await ui.connectionRestored;
  return ui;
 })().catch(error=>{pending=null;throw error;});
 return pending;
}
