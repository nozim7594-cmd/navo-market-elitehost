import './gift-motion.js';
import {walletConnector} from './wallet-connect.js';

const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products=[],user=null,config={},marketLive=false,page='market',kind='all',query='',sort='new',free=false;
let favorites=JSON.parse(localStorage.getItem('navo-favorites')||'[]');
const gallery = {
  pepe:  ['Plush Pepe', 'Raphael', '#567953'],
  cap:   ['Durov’s Cap', 'Cotton Candy', '#557e9d'],
  heart: ['Heart Locket', 'Royal Flush', '#a15c68'],
  shard: ['Astral Shard', 'Amethyst', '#765cad'],
  bear:  ['Toy Bear', 'Diamond', '#547d87'],
  rose:  ['Eternal Rose', 'Purple Bloom', '#865e98'],
  ring:  ['Diamond Ring', 'Hot Pink', '#9b5e82'],
  ball:  ['Crystal Ball', 'Fuschia', '#866281']
};
const normalizedName = name => String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
function imageKey(product) {
  if (product.kind !== 'gift') return null;
  return Object.keys(gallery).find(key => normalizedName(gallery[key][0]) === normalizedName(product.name));
}
const snapshot = await fetch('catalog.json').then(r=>r.json()).catch(()=>[]);
const savedMotion=new Map(snapshot.filter(p=>p.motion).map(p=>[p.address,p.motion]));
function motion(p){
  const file=savedMotion.get(p.address)||p.motion;
  return file?`<gift-motion aria-hidden="true" data-file="${esc(file)}"></gift-motion>`:'';
}
const sums=n=>new Intl.NumberFormat('uz-UZ').format(n);
let featured = 0, collection='',visibleCount=24;
const collectionName=p=>p.name.replace(/\s*#\d+$/, '').trim();
function featuredCollections() {
  const gifts = new Map();
  for (const p of products) {
    if (p.kind === 'gift' && !gifts.has(collectionName(p))) gifts.set(collectionName(p), p);
  }
  const choices = ['Astral Shard', 'Eternal Rose', 'Diamond Ring']
    .filter(name => gifts.has(name)).map(name => gifts.get(name));
  return choices.length ? choices : [...gifts.values()].filter(p => p.image).slice(0, 3);
}

function collectionShowcase(choices) {
  if (!choices.length) return '';
  featured = Math.min(featured, choices.length - 1);
  const p = choices[featured];
  const name = collectionName(p);
  const model = Object.keys(gallery).find(key => normalizedName(gallery[key][0]) === normalizedName(name));
  const image = model ? '/art/' + model + '.webp' : p.image;
  const members = products.filter(item => item.kind === 'gift' && collectionName(item) === name);
  const lowest = members.reduce((min,item) => Math.min(min,item.price),Infinity);
  const position = index => String(index).padStart(2,'0');
  return `<section class="collection-showcase" aria-label="${esc(name)}">
    <div class="showcase-copy">
      <span class="showcase-label">Kolleksiya <i aria-hidden="true"></i> ${position(featured + 1)} / ${position(choices.length)}</span>
      <h2>${esc(name)}</h2>
      <span class="showcase-price">${icon('ton')} ${ton(lowest)} TON / kun dan</span>
      <button type="button" class="showcase-open" id="open-collection">Kolleksiyani ko‘rish ${icon('arrow')}</button>
    </div>
    <div class="showcase-stage" aria-hidden="true">
      <img class="${model ? 'model-cutout' : 'model-cover'}" src="${esc(image)}" alt="" fetchpriority="high" decoding="async">
    </div>
    ${choices.length > 1 ? `<div class="showcase-switch">
      <button type="button" id="prev-collection" aria-label="Oldingi kolleksiya">${icon('next')}</button>
      <button type="button" id="next-collection" aria-label="Keyingi kolleksiya">${icon('next')}</button></div>` : ''}
  </section>`;
}
function icon(name) {
  return `<svg class="ui-icon" aria-hidden="true" focusable="false"><use href="/icons.svg#${name}"></use></svg>`;
}
const links = [
  ['market', 'Bozor'], ['favorites', 'Saqlanganlar'], ['rentals', 'Ijaralarim'],
  ['wallet', 'Hamyon'], ['profile', 'Profil']
];
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').style.display='none',4500)}
async function api(path,body){const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':window.Telegram?.WebApp?.initData||''},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error||'Xatolik yuz berdi');return data}
function nav() {
  const pages = user?.admin ? [...links, ['admin', 'Boshqaruv']] : links;
  const markup = pages.map(([id, label]) =>
    `<button data-page="${id}" class="${page === id ? 'active' : ''}" ${page === id ? 'aria-current="page"' : ''}>${icon(id)}${label}</button>`
  ).join('');
  const bar = $('#nav');
  if (bar.dataset.markup !== markup) {
    bar.innerHTML = markup;
    bar.dataset.markup = markup;
  }
  $('#balance').textContent = ton((user?.balance || 0) / 1e6);
}
function heading(title,subtitle){return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div><span class="live">Navo Market</span></div>`}
function displaySerial(p){const value=String(p.serial||'').replace(/^MarketApp\s*·?\s*/i,'').trim();return value||(p.source==='marketapp'?'Ijara taklifi':'')}
function art(p, animate = false) {
  const key = imageKey(p);
  const visual = p.image ? `<img loading="lazy" class="nft-model" style="width:100%;height:100%;object-fit:cover" src="${esc(p.image)}" alt="${esc(p.name)}">` : key ? `<img loading="lazy" class="nft-model" src="art/${key}.webp" alt="${esc(p.name)}" decoding="async">` :
    `<span class="art-text">${esc(p.kind==='gift'?'✧':p.emoji)}</span>`;
  return `<div class="art" style="--color:${p.color}"><span class="badge ${p.available&&!p.snapshot&&!p.demo?'available':''}">${p.snapshot?'KO‘RGAZMA':p.demo?'NAMUNA':p.available?'IJARAGA TAYYOR':'BAND'}</span>${visual}${animate ? motion(p) : ''}</div>`;
}
function empty(title,desc,icon='✧'){return `<div class="empty"><span>${icon}</span><h2>${title}</h2><p>${desc}</p></div>`}
function market() {
  const saved = page === 'favorites';
  const choices = saved ? [] : featuredCollections();
  const collections = [...new Set(products.filter(p => p.kind === 'gift').map(collectionName))].sort();
  const filterCount = Number(Boolean(collection)) + Number(kind !== 'all') + Number(sort !== 'new');
  const option = ([value,label],current) => `<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`;
  const title = saved ? 'Saqlanganlar' : 'Sovg‘alar bozori';
  $('#main').innerHTML = `<div class="storefront">
    ${collectionShowcase(choices)}
    <div class="catalog-command"><div class="catalog-heading"><h1>${title}</h1><span id="count" aria-live="polite"></span></div>

    <div class="catalog-tools"><label class="catalog-search">${icon('search')}<input id="q" type="search" placeholder="Sovg‘a nomi yoki raqami" aria-label="Sovg‘ani qidirish" value="${esc(query)}"></label>
      <button id="filter-toggle" aria-controls="catalog-options" aria-expanded="false">${icon('sliders')}<span>Filtr</span>${filterCount ? `<b>${filterCount}</b>` : ''}</button></div>
    </div>
    ${!marketLive && products.some(p=>p.snapshot) ? '<p class="store-notice">Ko‘rgazma · Jonli katalog vaqtincha mavjud emas.</p>' : ''}
    <div id="catalog-options" class="catalog-options" hidden>
      <label>Turi<select id="catalog-kind">${[['all','Hammasi'],['gift','Sovg‘alar'],['username','Username'],['number','Raqamlar']].map(v=>option(v,kind)).join('')}</select></label>
      <label>Kolleksiya<select id="catalog-collection">${[['','Barchasi'],...collections.map(n=>[n,n])].map(v=>option(v,collection)).join('')}</select></label>
      <label>Saralash<select id="sort">${[['new','Yangilari'],['cheap','Avval arzonlari'],['expensive','Avval qimmatlari']].map(v=>option(v,sort)).join('')}</select></label>
      <button type="button" id="filter-reset">${icon('reset')} Tozalash</button>
    </div>
    <div class="catalog-pills">
      <button id="catalog-all" aria-pressed="${!saved && !free && !collection && kind==='all'}">Hammasi</button>
      <button id="catalog-free" aria-pressed="${free}"><i></i> Bo‘shlari</button>
      <button data-page="${saved?'market':'favorites'}" aria-pressed="${saved}">${icon('favorites')} Saqlangan</button>
      ${collection ? `<button id="clear-collection" aria-label="Kolleksiya filtrini olib tashlash">${esc(collection)} ${icon('close')}</button>` : ''}
    </div>
    <div id="grid" class="gift-grid"></div><button class="secondary load-more" id="load-more">Yana ko‘rsatish</button></div>`;

  function resetCriteria(){free=false;collection='';kind='all';sort='new';query='';visibleCount=24;}
  function updateFilters() {
    collection=$('#catalog-collection').value;
    kind=$('#catalog-kind').value;
    sort=$('#sort').value;
    visibleCount=24;
    market();
    $('#filter-toggle').click();
  }
  $('#q').oninput=e=>{query=e.target.value;visibleCount=24;drawGrid()};
  $('#catalog-all').onclick=()=>{resetCriteria();page='market';location.hash=page;render()};
  $('#catalog-free').onclick=()=>{free=!free;visibleCount=24;market()};
  $('#filter-toggle').onclick=e=>{
    const panel=$('#catalog-options');panel.hidden=!panel.hidden;
    e.currentTarget.setAttribute('aria-expanded',String(!panel.hidden));
  };
  $('#filter-reset').onclick=()=>{resetCriteria();market()};
  for(const id of ['#catalog-collection','#catalog-kind','#sort']) $(id).onchange=updateFilters;
  if ($('#clear-collection')) $('#clear-collection').onclick=()=>{collection='';visibleCount=24;market()};
  const showcase = $('.collection-showcase');
  if (showcase) {
    showcase.onclick = event => {
      const action = event.target.closest('button')?.id;
      if (action === 'open-collection') {
        resetCriteria();
        collection = collectionName(choices[featured]);
        market();
        $('.catalog-heading').scrollIntoView({block:'start'});
      } else if (action === 'prev-collection' || action === 'next-collection') {
        const direction = action === 'prev-collection' ? -1 : 1;
        featured = (featured + direction + choices.length) % choices.length;
        const replacement = document.createElement('template');
        replacement.innerHTML = collectionShowcase(choices);
        const slide = replacement.content.firstElementChild;
        showcase.setAttribute('aria-label',slide.getAttribute('aria-label'));
        showcase.replaceChildren(...slide.childNodes);
        showcase.querySelector('#' + action).focus({preventScroll:true});
      }
    };
  }
  $('#load-more').onclick=()=>{visibleCount+=24;drawGrid()};
  drawGrid();
}

function giftCard(p) {
  const serial = String(p.name).match(/#\d+$/)?.[0] || (p.source==='marketapp'?'':p.serial);
  const name = collectionName(p);
  const favorite = favorites.includes(p.id);
  return `<article class="gift-card">
    <button type="button" class="gift-open" data-item="${p.id}" aria-label="${esc(p.name)}">
      ${art(p)}
      <span class="gift-caption"><span class="gift-name">${esc(name)}</span>
        ${serial ? `<small class="gift-serial">${esc(serial)}</small>` : ''}
        <span class="gift-price">${icon('ton')}<b>${ton(p.price)} TON</b><small>/ kun</small></span>
      </span>
    </button>
    <button type="button" class="heart" data-fav="${p.id}" aria-label="Saqlash: ${esc(p.name)}" aria-pressed="${favorite}">${icon('favorites')}</button>
  </article>`;
}

function drawGrid() {
  const search = query.toLowerCase().trim();
  const list=products.filter(p=>(page!=='favorites'||favorites.includes(p.id))&&(kind==='all'||p.kind===kind)&&
    (!free||p.available)&&(!collection||collectionName(p)===collection)&&
    `${p.name} ${displaySerial(p)}`.toLowerCase().includes(search));
  if(sort!=='new') list.sort((a,b)=>sort==='cheap'?a.price-b.price:b.price-a.price);
  $('#count').textContent=`${sums(list.length)} ta`;
  $('#grid').innerHTML=list.length ? list.slice(0,visibleCount).map(giftCard).join('') :
    empty(page==='favorites'&&!favorites.length?'Saqlangan sovg‘alar yo‘q':'Hech narsa topilmadi',
      page==='favorites'&&!favorites.length?'Yoqtirgan sovg‘angizdagi yurakchani bosing.':'Qidiruv yoki filtrlarni o‘zgartiring.');
  $('#load-more').hidden=list.length<=visibleCount;
}
function show(content){
  $('#modal-body').innerHTML=content;
  $('#modal').showModal();
  $('#modal').scrollTop=0;
  document.body.classList.add('modal-open');
}
function ton(n){return new Intl.NumberFormat('en',{maximumFractionDigits:9}).format(n)}
function partnerProduct(p) {
  const live=!p.snapshot && p.available && user && config.marketapp_checkout;
  const explanation=p.snapshot?'Bu namuna sovg‘a.':!user?'Ijaraga olish uchun bot orqali kiring.':!config.marketapp_checkout?'Ijara hozircha ulanmagan.':'';
  const termOptions = [...new Set([p.minDays, 3, 7, 14, 30])].filter(d=>d>=p.minDays && d<=p.maxDays).slice(0,4);
  show(art(p,true)+`<div class="rental-sheet"><div class="detail-title"><h2>${esc(collectionName(p))}</h2><span>${esc(p.name.match(/#\d+$/)?.[0]||'')}</span></div>
    <p class="detail-day-price">${icon('ton')} ${ton(p.price)} TON <small>/ kun</small></p>
    <div class="duration-control"><label for="days">Ijara muddati<small>${p.minDays}–${p.maxDays} kun</small></label>
      <div class="duration-stepper">
        ${live?'<button type="button" data-step="-1" aria-label="Bir kun kamaytirish">−</button>':''}
        <input id="days" ${live?'':'disabled'} type="number" inputmode="numeric" min="${p.minDays}" max="${p.maxDays}" value="${p.minDays}">
        ${live?`<button type="button" data-step="1" aria-label="Bir kun qo‘shish">${icon('plus')}</button>`:''}
      </div>
    </div>
    ${live?`<div class="term-options" aria-label="Ijara muddati">${termOptions.map(d=>`<button type="button" data-term="${d}" aria-pressed="${d===p.minDays}">${d} kun</button>`).join('')}</div>`:''}
    ${live?`<details class="rental-link"><summary>Fragment havolasini qo‘shish</summary><p>Ijara sovg‘asini ulash uchun Fragment havolasi kerak.</p><input id="connect-link" type="url" aria-label="Fragment ulanish havolasi" placeholder="https://app.tonkeeper.com/ton-connect…"></details>`:''}
    <div class="rental-checkout"><div class="summary rental-total"><span>Jami <b id="chosen-days">${p.minDays} kun</b></span><strong id="total">${live?'Hisoblanmoqda…':'—'}</strong></div>
    ${live?`<button class="primary rental-buy" id="partner-buy" disabled>Hisoblanmoqda…</button>`:`<p class="hint">${explanation}</p>`}</div></div>`);
  if(!live)return;
  let quote=null,generation=0,timer;
  const button=$('#partner-buy'),days=$('#days'),total=$('#total');
  const terms = [...document.querySelectorAll('[data-term]')];
  const durationLabel = $('#chosen-days');
  for (const step of document.querySelectorAll('[data-step]')) {
    step.onclick = () => {
      if (days.disabled) return;
      const next = (Number(days.value) || p.minDays) + Number(step.dataset.step);
      days.value = Math.max(p.minDays, Math.min(next, p.maxDays));
      days.dispatchEvent(new Event('input'));
    };
  }
  for (const term of terms) term.onclick = () => {
    if (days.disabled) return;
    days.value = term.dataset.term;
    days.dispatchEvent(new Event('input'));
  };
  async function price(){
    const current=++generation;quote=null;button.disabled=true;button.textContent='To‘lash';
    if(!days.checkValidity()||!days.value){total.textContent='—';return;}
    total.textContent='Hisoblanmoqda…';
    try{
      const next=await api('partner/quote',{product_id:p.id,days:Number(days.value)});
      if(current!==generation||!button.isConnected||!$('#modal').open)return;
      quote=next;total.textContent=ton(quote.total_micro/1e6)+' TON';
      button.textContent='Ijaraga olish';button.disabled=false;
    }catch(error){if(current===generation){total.textContent='Narx mavjud emas';toast(error.message)}}
  }
  days.oninput=()=>{clearTimeout(timer);generation++;quote=null;button.disabled=true;durationLabel.textContent=(days.value||'—')+' kun';for(const t of terms)t.setAttribute('aria-pressed',String(t.dataset.term===days.value));total.textContent='Hisoblanmoqda…';timer=setTimeout(price,300)};
  void price();
  button.onclick=async()=>{
    if(!quote||!days.reportValidity())return;
    if(!$('#connect-link').value.trim()){document.querySelector('.rental-link').open=true;$('#connect-link').focus();return toast('Avval Fragment havolasini kiriting.')}
    button.disabled=true;days.disabled=true;
    try{
      if(quote.deadline<=Date.now()/1000){const previous=quote.total_micro;await price();if(!quote)return;if(quote.total_micro!==previous){toast('Narx yangilandi. Yangi summani tekshiring.');return}}
      const order=await api('partner/rent',{quote_id:quote.id,link:$('#connect-link').value.trim()});
      $('#modal').close();page='rentals';await load();render();toast(status(order.state));
    }catch(error){toast(error.message)}finally{days.disabled=false;button.disabled=!quote}
  };
}
function product(id){const p=products.find(x=>x.id===id);if(!p)return;if(p.source==='marketapp')return partnerProduct(p);show(art(p,true)+`<h2>${esc(p.name)}</h2><p>Bir bosishda ijara.</p><span class="hero-price">${ton(p.price)} TON <small>/ kun</small></span><label class="stack">Ijara muddati<select id="days">${[1,3,7,14,30].map(d=>`<option value="${d}">${d} kun</option>`).join('')}</select></label><div class="summary">Jami narx <b id="total">${p.price.toFixed(2)} TON</b></div><p class="hint">Balansdan to‘lanadi.</p><button class="primary" id="rent">Ijaraga olish</button><p class="hint">${p.demo?'Bu namuna aktiv, ijaraga berilmaydi.':''}</p>`);$('#days').onchange=e=>$('#total').textContent=(p.price*+e.target.value).toFixed(2)+' TON';$('#rent').onclick=async()=>{if(p.demo)return toast('Namuna aktiv. Administrator haqiqiy aktivlarni qo‘shishi kerak.');if(!user)return toast('Ijaraga olish uchun ilovani Telegram bot orqali oching.');try{const result=await api('rent',{product_id:p.id,days:+$('#days').value});user.balance=result.balance;$('#modal').close();toast('Buyurtma qabul qilindi. Aktiv berilishini kuting.');await load();render()}catch(e){toast(e.message)}}}
let paymentRows=[],paymentBusy=false,activeInvoice=null;
function paymentHistory(){return paymentRows.length?paymentRows.map(p=>`<div class="row payment-row"><span class="payment-symbol">${p.method==='stars' ? icon('star') : icon('ton')}</span><div class="payment-detail"><b>${ton(p.amount)} ${p.method==='stars'?'Stars':'TON'}</b><small>${new Date(p.created_at*1000).toLocaleString('uz-UZ')}</small></div><span class="pill ${p.status==='approved'?'success':''}">${p.status==='expired'?'Muddati tugagan':status(p.status)}</span>${p.method==='ton'&&p.status==='pending'?`<button class="secondary" data-payment="${p.id}">Ochish</button>`:''}</div>`).join(''):empty('Hali to‘lov yo‘q','To‘lovlar va ularning holati shu yerda ko‘rinadi.','◇')}
async function refreshPayments(){
 if(!user||paymentBusy||document.hidden)return;paymentBusy=true;
 try{
  const oldBalance=user.balance;user=await api('me');nav();
  document.querySelectorAll('[data-wallet-balance]').forEach(e=>e.textContent=ton(user.balance/1e6));
  if(page==='wallet'||activeInvoice){
   paymentRows=await api('payments');
   if($('#payment-history'))$('#payment-history').innerHTML=paymentHistory();
   const p=paymentRows.find(p=>p.id===activeInvoice);
   if(p&&$('#invoice-status')){
    $('#invoice-status').textContent=p.status==='approved'?'To‘lov tasdiqlandi. Balans yangilandi.':p.status==='expired'?'Hisob muddati tugadi. Yangi hisob yarating.':'Blokcheyn tasdig‘i kutilmoqda…';
    if(p.status!=='pending')$('#invoice-actions')?.remove();
   }
  }
  if(user.balance>oldBalance)toast('To‘lov qabul qilindi. Balans yangilandi.');
 }catch{if($('#payment-sync'))$('#payment-sync').textContent='Aloqa tiklangach to‘lov holati yangilanadi.'}
 finally{paymentBusy=false}
}
let resumeInvoice=null,tonSending=false;
const sentInvoices=new Set();
const sentKey=id=>'navo-sent-'+user?.id+'-'+id;
function wasSent(id){try{return sentInvoices.has(id)||sessionStorage.getItem(sentKey(id))==='1'}catch{return sentInvoices.has(id)}}
async function updateConnectedWallet(){
 try{
  const ui=await walletConnector(),account=ui.account;
  const label=$('#connected-address'),button=$('#connect-wallet'),disconnect=$('#disconnect-wallet');
  if(label)label.textContent=account?account.address.slice(0,8)+'…'+account.address.slice(-6):'Tonkeeper yoki boshqa TON hamyonini tanlang';
  if(button)button.textContent=account?'Hamyonni almashtirish':'Hamyonni ulash';
  if(disconnect)disconnect.hidden=!account;
  if(account&&resumeInvoice){const invoice=resumeInvoice;resumeInvoice=null;setTimeout(()=>openTonInvoice(invoice),200);}
 }catch{if($('#connected-address'))$('#connected-address').textContent='Hamyon xizmatiga ulanib bo‘lmadi. Qayta urinib ko‘ring.';}
}
window.addEventListener('navo-wallet-change',updateConnectedWallet);
function openTonInvoice(p){
 activeInvoice=p.id;
 const memo=p.memo||p.reference,nano=p.nano||String(Math.round(p.amount*1e6)*1000),sent=wasSent(p.id);
 const url='https://app.tonkeeper.com/transfer/'+encodeURIComponent(p.wallet)+'?'+new URLSearchParams({amount:nano,text:memo});
 show(`<div class="invoice-mark">◇</div><span class="eyebrow">TON TO‘LOVI</span><h2>${ton(p.amount)} TON</h2><p id="invoice-status" role="status">${sent?'Tranzaksiya yuborildi. Blokcheyn tasdig‘i kutilmoqda…':'Hamyoningizda to‘lovni tasdiqlang.'}</p><div id="invoice-actions">${sent?'<p class="hint">Ushbu hisob uchun qayta pul yubormang. Balans tasdiqdan keyin yangilanadi.</p>':`<button class="primary pay-link" id="connected-pay">Hamyon orqali to‘lash</button><p class="hint">Summa va to‘lov izohi avtomatik kiritiladi. Hamyoningizda tasdiqlashingiz kerak.</p><details class="manual-transfer"><summary>Qo‘lda yuborish</summary><label class="stack">Qabul qiluvchi<input readonly value="${esc(p.wallet)}"></label><button class="copy-value secondary" data-copy="${esc(p.wallet)}">Manzilni nusxalash</button><label class="stack">To‘lov izohi<input readonly value="${esc(memo)}"></label><button class="copy-value secondary" data-copy="${esc(memo)}">Izohni nusxalash</button><a class="secondary pay-link" href="${esc(url)}" target="_blank" rel="noopener">Tonkeeper’da ochish</a><p class="hint">Aynan shu summa va izohni yuboring.</p></details>`}</div><p class="hint">Balans faqat blokcheyn tasdig‘idan keyin yangilanadi. Oynani yopishingiz mumkin.</p>`);
 const button=$('#connected-pay');
 if(button)button.onclick=async()=>{
  if(tonSending)return;tonSending=true;button.disabled=true;
  try{
   const ui=await walletConnector();
   if(!ui.account){resumeInvoice=p;$('#modal').close();await ui.openModal();return;}
   if(ui.account.chain!=='-239')throw Error('Hamyoningizni TON mainnet tarmog‘iga o‘tkazing.');
   const transaction=await api('payments/ton-transaction',{id:p.id});
   transaction.from=ui.account.address;
   $('#modal').close();
   await ui.sendTransaction(transaction);
   sentInvoices.add(p.id);try{sessionStorage.setItem(sentKey(p.id),'1')}catch{}
   if(page==='wallet')openTonInvoice(p);
   toast('Tranzaksiya yuborildi. Tasdiq kutilmoqda.');await refreshPayments();
  }catch(error){toast(error?.message?.includes('mainnet')?error.message:'To‘lov tasdiqlanmadi. Qayta yuborishdan oldin hamyon tarixini tekshiring.');}
  finally{tonSending=false;button.disabled=false;}
 };
 refreshPayments();
}
async function wallet(){
 if(user)try{paymentRows=await api('payments')}catch(e){toast(e.message)}
 if(page!=='wallet')return;
 $('#main').innerHTML=heading('Hamyon','To‘ldiring. Tasdiqni kuzating. Ijarani boshlang.')+`<div class="two-col wallet-layout"><section class="panel balance-panel"><div class="balance-top"><span class="eyebrow">SIZNING BALANSINGIZ</span><span class="wallet-seal">${icon('ton')}</span></div><div class="large-balance"><span data-wallet-balance>${ton((user?.balance||0)/1e6)}</span> <small>TON</small></div><p>Sevimli sovg‘angiz uchun tayyor.</p><div class="wallet-note">${icon('star')} Stars <span>${icon('ton')} TON</span></div><div class="connected-wallet"><span class="eyebrow">TON CONNECT</span><p id="connected-address" aria-live="polite">Hamyonni ulash orqali tezroq to‘lang</p><button class="primary" id="connect-wallet">Hamyonni ulash</button><button class="secondary" id="disconnect-wallet" hidden>Uzish</button></div><p class="hint" id="payment-sync">Tasdiqlangan to‘lovdan keyin balans avtomatik yangilanadi.</p></section><form class="panel stack" id="topup"><h2>Balansni to‘ldirish</h2><fieldset class="payment-methods"><legend>To‘lov usuli</legend><label><input type="radio" name="method" value="stars" ${config.stars_enabled?'checked':''} ${!config.stars_enabled?'disabled':''}><span><b>${icon('star')} Stars</b><small>Telegram orqali</small></span></label><label><input type="radio" name="method" value="ton" ${!config.stars_enabled&&config.ton_auto?'checked':''} ${!config.ton_auto?'disabled':''}><span><b>${icon('ton')} TON</b><small>TON hamyonidan</small></span></label></fieldset><label>Summa <input name="amount" type="number" inputmode="decimal" required></label><div class="amount-presets" id="amount-presets"></div><div class="summary">Balansga tushadi <b id="credit-preview">—</b></div><p class="hint" id="rate-note"></p>${!config.stars_enabled||!config.ton_auto?`<p class="hint">${!config.stars_enabled?'Stars to‘lovlari hali ulanmagan. ':''}${!config.ton_auto?'TON to‘lovlari hali ulanmagan.':''}</p>`:''}<button class="primary" ${!config.stars_enabled&&!config.ton_auto?'disabled':''}>To‘lovni davom ettirish</button><p class="hint">Balans faqat tasdiqlangan to‘lov bo‘yicha to‘ldiriladi.</p></form></div><section class="panel"><div class="history-title"><h2>To‘lovlar tarixi</h2><button class="secondary" id="refresh-payments">Yangilash</button></div><div id="payment-history">${paymentHistory()}</div></section>`;
 updateConnectedWallet();
 $('#connect-wallet').onclick=async()=>{try{const ui=await walletConnector();if(ui.connected)await ui.disconnect();await ui.openModal();}catch{toast('Hamyonni ulab bo‘lmadi. Qayta urinib ko‘ring.')}};
 $('#disconnect-wallet').onclick=async()=>{try{await (await walletConnector()).disconnect();await updateConnectedWallet();}catch{toast('Qayta urinib ko‘ring.')}};
 const form=$('#topup'),amount=form.elements.amount;
 function preview(){const stars=form.elements.method.value==='stars';$('#credit-preview').textContent=Number(amount.value)>0?ton(stars?(config.stars_credit_micro?Number(amount.value)*config.stars_credit_micro/1e6:Number(amount.value)/config.stars_per_ton):Number(amount.value))+' TON':'—'}
 function method(){const stars=form.elements.method.value==='stars';amount.min=stars?'1':'0.01';amount.max=stars?'100000':'10000';amount.step=stars?'1':'0.000001';amount.value=stars?'100':'1';$('#amount-presets').innerHTML=(stars?[100,250,500,1000]:[1,2,5,10]).map(n=>`<button type="button" data-amount="${n}">${n}</button>`).join('');$('#rate-note').textContent=stars?`100 Stars = ${ton(config.stars_ton_per_100||100/config.stars_per_ton)} TON. Kurs to‘lov yaratilganda belgilanadi.`:'TON mainnet · Komissiya hamyon tomonidan alohida ko‘rsatiladi.';preview()}
 form.onchange=e=>{if(e.target.name==='method')method()};amount.oninput=preview;
 $('#amount-presets').onclick=e=>{if(e.target.dataset.amount){amount.value=e.target.dataset.amount;preview()}};
 method();$('#refresh-payments').onclick=refreshPayments;
 form.onsubmit=async e=>{e.preventDefault();if(!user)return toast('To‘lov uchun Telegram bot orqali kiring.');const button=form.querySelector('button.primary');button.disabled=true;
 try{const result=await api('payments',{method:form.elements.method.value,amount:Number(amount.value)});if(result.invoice_url){if(window.Telegram?.WebApp?.openInvoice)window.Telegram.WebApp.openInvoice(result.invoice_url,()=>refreshPayments());else location.href=result.invoice_url}else openTonInvoice(result);await refreshPayments()}catch(err){toast(err.message)}finally{button.disabled=false}};
}
document.addEventListener('click',async e=>{const copy=e.target.closest('[data-copy]');if(copy){try{await navigator.clipboard.writeText(copy.dataset.copy);toast('Nusxalandi.')}catch{toast('Maydondagi matnni belgilab, nusxalang.')}}const pay=e.target.closest('[data-payment]');if(pay){const p=paymentRows.find(p=>p.id===Number(pay.dataset.payment));if(p)openTonInvoice(p)}});
setInterval(refreshPayments,5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPayments()});
function status(s){return ({checking:'Blokcheyn tasdig‘i kutilmoqda',connecting:'Fragment ulanmoqda',needs_link:'Yangi Fragment havolasi kerak',sending:'Tranzaksiya yuborilmoqda',queued:'Navbatda',transferring:'NFT yetkazilmoqda',ready:'Fragment ulanishi kutilmoqda',completed:'Yakunlangan',pending:'Kutilmoqda',paid:'To‘langan',approved:'Tasdiqlangan',rejected:'Rad etilgan',active:'Faol',returning:'Qaytarish kutilmoqda',expired:'Yakunlangan',cancelled:'Bekor qilingan'})[s]||s}
async function rentals(){let list=[];if(user)try{list=await api('rentals')}catch(e){toast(e.message)}$('#main').innerHTML=heading('Ijaralarim','Aktivlaringiz va ijara muddatlari.')+`<section class="panel">${list.length?list.map(r=>`<div class="row"><div><b>${esc(r.name)}</b><small>${r.days} kun · ${(r.total/1e6).toFixed(2)} TON${r.ends_at?' · '+new Date(r.ends_at*1000).toLocaleDateString('uz-UZ'):''}</small></div><span class="pill rental-status status-${esc(r.status)}">${status(r.status)}</span>${r.status==='needs_link'?`<button class="secondary" data-relink="${esc(r.id)}">Qayta ulash</button>`:''}</div>`).join(''):empty('Hali ijara yo‘q','Bozordan o‘zingizga mos kolleksiyani tanlang.','◷')}</section>`}
function profile(){$('#main').innerHTML=heading('Profil','Navo Market’dagi shaxsiy sahifangiz.')+`<section class="panel"><h2>${esc(user?.name||'Xush kelibsiz!')}</h2><p>${user?'Telegram ID: '+user.id:'Ilovani Telegram ichidan ochib, hisobingizga kiring.'}</p><p class="hint">Telegram ma’lumotlari serverda tekshiriladi. Ijara va balans hisobingizga bog‘lanadi.</p><div class="profile-links"><button class="secondary" data-page="favorites">${icon('favorites')} Saqlanganlar</button>${user?.admin?`<button class="secondary" data-page="admin">${icon('admin')} Admin panel</button>`:''}<button class="primary" data-page="market">Bozorga o‘tish</button></div></section>`}
async function adminBalances(q=''){
 const data=await api('admin/users?'+new URLSearchParams({q}));
 let panel=$('#balance-admin');if(!panel){panel=document.createElement('section');panel.id='balance-admin';panel.className='panel admin-balance-panel';$('#main').insertBefore(panel,$('#main').children[1]);}
 panel.innerHTML=`<div class="admin-panel-head"><div><span class="eyebrow">BALANS NAZORATI</span><h2>Foydalanuvchilar balansi</h2><p>Har bir qo‘lda o‘zgarish tarixda saqlanadi.</p></div><span class="admin-count">${data.users.length} foydalanuvchi</span></div><label class="admin-search">ID yoki ism bo‘yicha qidiring<input id="admin-user-search" type="search" maxlength="80" value="${esc(q)}" placeholder="Telegram ID yoki ism"></label><div class="admin-user-list">${data.users.map(u=>`<div class="admin-user-row"><div class="admin-user-avatar">${esc((u.name||'?').slice(0,1).toUpperCase())}</div><div class="admin-user-details"><b>${esc(u.name)}</b><small>ID ${u.id}</small></div><strong>${ton(u.balance/1e6)} TON</strong><button class="secondary" data-adjust="${u.id}" data-name="${esc(u.name)}">O‘zgartirish</button></div>`).join('')||'<p>Foydalanuvchi topilmadi.</p>'}</div><details class="admin-history"><summary>O‘zgarishlar tarixi</summary>${data.history.map(a=>`<div class="row"><div><b>${esc(a.name)} · ${a.delta>0?'+':''}${ton(a.delta/1e6)} TON</b><small>ID ${a.user_id} · ${new Date(a.created_at*1000).toLocaleString('uz-UZ')} · ${esc(a.reason)}</small></div><span>${ton(a.before_balance/1e6)} → ${ton(a.after_balance/1e6)}</span></div>`).join('')||'<p>O‘zgarishlar hali yo‘q.</p>'}</details>`;
 let timer;$('#admin-user-search').oninput=e=>{const value=e.target.value;clearTimeout(timer);timer=setTimeout(()=>adminBalances(value),300)};
 panel.onclick=e=>{const button=e.target.closest('[data-adjust]');if(!button)return;const id=Number(button.dataset.adjust);show(`<span class="eyebrow">BALANS NAZORATI</span><h2>${esc(button.dataset.name)}</h2><p>Telegram ID ${id}</p><form id="balance-form" class="stack"><label>Amal<select name="direction"><option value="add">Balansga qo‘shish</option><option value="subtract">Balansdan ayirish</option></select></label><label>Summa (TON)<input name="amount" type="number" inputmode="decimal" min="0.000001" max="1000" step="0.000001" required></label><label>Sabab<input name="reason" maxlength="200" minlength="3" required placeholder="Masalan: to‘lovni tuzatish"></label><button class="primary">Saqlash</button></form>`);$('#balance-form').onsubmit=async event=>{event.preventDefault();const form=event.target,submit=form.querySelector('button');submit.disabled=true;const amount=Number(form.elements.amount.value),delta=form.elements.direction.value==='subtract'?-amount:amount;try{await api('admin/balance',{user_id:id,delta,reason:form.elements.reason.value,request_id:crypto.randomUUID()});$('#modal').close();toast('Balans yangilandi.');await adminBalances($('#admin-user-search')?.value||'')}catch(error){toast(error.message)}finally{submit.disabled=false}}};
}
async function adminWallets() {
 if (!user?.owner) return;
 const settings = await api('admin/wallets');
 const panel = document.createElement('section');
 panel.id = 'wallet-settings';
 panel.className = 'panel wallet-settings';
 $('#main').insertBefore(panel, $('#main').children[1]);
 panel.innerHTML = `<div class="admin-panel-head"><div><span class="eyebrow">EGASI UCHUN</span><h2>Hamyon manzillari</h2></div></div>
  <form id="wallet-settings-form" class="stack">
   <label>TON qabul qilish manzili<input name="deposit_address" required maxlength="100" spellcheck="false" autocomplete="off" value="${esc(settings.deposit_address)}"></label>
   <p class="hint">Yangi to‘lovlar shu manzilga keladi. Eski hisoblar avvalgi manzil orqali tekshiriladi.</p>
   <label>Ijara uchun to‘lov hamyoni<input name="rental_address" maxlength="100" spellcheck="false" autocomplete="off" value="${esc(settings.rental_address)}"></label>
   <p class="hint">Manzil serverdagi hamyon kalitiga mos bo‘lishi kerak. Yangi hamyonning tiklash iborasi hostingdagi MARKETAPP_WALLET_MNEMONIC sozlamasida yangilanadi.</p>
   <button class="primary">O‘zgarishlarni tekshirish</button>
  </form>
  <details class="admin-history"><summary>Manzillar tarixi</summary>${settings.history.map(row=>`<div class="wallet-history-row"><b>${new Date(row.created_at*1000).toLocaleString('uz-UZ')} · ID ${row.admin_id}</b><small>Qabul qilish</small><code>${esc(row.old_deposit||'—')} → ${esc(row.new_deposit)}</code><small>Ijara</small><code>${esc(row.old_rental||'—')} → ${esc(row.new_rental||'—')}</code></div>`).join('')||'<p>O‘zgarishlar yo‘q.</p>'}</details>`;
 $('#wallet-settings-form').onsubmit = event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  show(`<h2>Manzillarni tasdiqlash</h2><div class="wallet-review"><b>TON qabul qilish</b><code>${esc(values.deposit_address)}</code><b>Ijara uchun to‘lov</b><code>${esc(values.rental_address||'—')}</code></div><button class="primary" id="save-wallet-settings">Tasdiqlash va saqlash</button><p id="wallet-save-error" role="alert"></p>`);
  $('#save-wallet-settings').onclick = async () => {
   const button = $('#save-wallet-settings');
   button.disabled = true;
   try {
    await api('admin/wallets', {...values, revision:settings.revision});
    $('#modal').close();
    toast('Hamyon manzillari saqlandi.');
    await load();
    await admin();
   } catch (error) {
    $('#wallet-save-error').textContent = error.message;
    button.disabled = false;
   }
  };
 };
}
async function adminOrders(){
 const data=await api('admin/orders');
 let panel=$('#order-admin');if(!panel){panel=document.createElement('section');panel.id='order-admin';panel.className='panel order-admin-panel';$('#main').insertBefore(panel,$('#balance-admin')||$('#main').children[1])}
 const orders=data.orders||[],issues=orders.filter(o=>['sending','checking','connecting','needs_link'].includes(o.state));
 panel.innerHTML=`<div class="admin-panel-head"><div><span class="eyebrow">AVTOMATIK IJARA</span><h2>Buyurtmalar nazorati</h2><p>${issues.length} ta buyurtma e’tibor talab qiladi</p></div><button class="secondary" id="check-orders">Holatni tekshirish</button></div><div class="order-list">${orders.length?orders.map(o=>`<div class="order-line ${issues.includes(o)?'order-issue':''}"><div class="order-main"><b>${esc(o.name)}</b><span class="pill ${o.state==='active'?'success':''}">${esc(status(o.state))}</span></div><small>#${esc(o.id.slice(0,8))} · ${esc(o.customer)} · ID ${o.user_id} · ${o.days} kun · ${ton(o.total/1e6)} TON</small><small>${new Date(o.created*1000).toLocaleString('uz-UZ')}${o.reviewed_at?' · Ko‘rib chiqilgan':''}</small>${o.note?`<p class="order-note">${esc(o.note)}</p>`:''}<button class="secondary" data-review-order="${esc(o.id)}">Izoh qo‘shish</button></div>`).join(''):empty('Buyurtmalar yo‘q','Avtomatik ijara buyurtmalari shu yerda ko‘rinadi.')}</div>`;
 $('#check-orders').onclick=async()=>{const button=$('#check-orders');button.disabled=true;try{await api('admin/orders/check',{});await adminOrders();toast('Holat yangilandi.')}catch(error){toast(error.message);button.disabled=false}};
 panel.onclick=e=>{const id=e.target.closest('[data-review-order]')?.dataset.reviewOrder;if(!id)return;show(`<h2>Buyurtma izohi</h2><p>#${esc(id.slice(0,8))}</p><form id="order-review-form" class="stack"><label>Qilingan tekshiruv<textarea name="note" required minlength="3" maxlength="300" placeholder="Masalan: provayder holati tekshirildi"></textarea></label><button class="primary">Saqlash</button></form>`);$('#order-review-form').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{await api('admin/orders/review',{id,note:event.target.elements.note.value});$('#modal').close();await adminOrders();toast('Izoh saqlandi.')}catch(error){toast(error.message);button.disabled=false}}};
}
async function admin(){try{const data=await api('admin');$('#main').innerHTML=heading('Boshqaruv','To‘lovlarni tasdiqlang va aktivlarni boshqaring.')+`<section class="panel"><h2>Kutilayotgan to‘lovlar</h2>${data.payments.length?data.payments.map(p=>`<div class="row"><div>#${p.id} · ${esc(p.name)} · ${p.amount} ${esc(p.method)}<small>${esc(p.reference)}</small></div><div class="admin-actions"><button data-approve="${p.id}">Tasdiqlash</button><button data-reject="${p.id}">Rad etish</button></div></div>`).join(''):'Kutilayotgan to‘lovlar yo‘q.'}</section><section class="panel"><h2>Aktivni berish</h2>${data.rentals.length?data.rentals.map(r=>`<div class="row"><div>#${r.id} · ${esc(r.name)}<small>User ${r.user_id} · ${r.days} kun</small></div><div class="admin-actions"><button data-deliver="${r.id}">${r.status==='returning'?'Aktiv qaytarildi':'Berildi'}</button>${r.status==='pending'?`<button data-cancel="${r.id}">Bekor qilish + qaytarish</button>`:''}</div></div>`).join(''):'Kutilayotgan buyurtmalar yo‘q.'}</section><form id="add-product" class="panel stack"><h2>Kolleksiya qo‘shish</h2><label>Nomi<input name="name" required maxlength="70"></label><label>Turi<select name="kind"><option value="gift">Sovg‘a</option><option value="username">Username</option><option value="number">Raqam</option></select></label><label>Raqami / izohi<input name="serial" required maxlength="80"></label><label>Kunlik narx (TON)<input name="price" type="number" min="0.000001" step="0.000001" required></label><label>Belgi (emoji yoki username)<input name="emoji" required maxlength="30"></label><label>Rang<input name="color" type="color" value="#448e72"></label><button class="primary">Qo‘shish</button></form>`;await adminBalances();await adminOrders();await adminWallets();$('#add-product').onsubmit=async e=>{e.preventDefault();try{await api('admin/products',Object.fromEntries(new FormData(e.target)));toast('Aktiv qo‘shildi.');await load();admin()}catch(err){toast(err.message)}}}catch(e){toast(e.message)}}
async function load(){try{const data=await api('bootstrap');marketLive=Boolean(data.partner_enabled);products=marketLive?data.products:[...snapshot,...data.products];user=data.user;config=data.config}catch{marketLive=false;products=snapshot;user=null;config={}}}
function render(){nav();if(page==='market'||page==='favorites')market();else if(page==='wallet')wallet();else if(page==='rentals')rentals();else if(page==='admin'&&user?.admin)admin();else profile()}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-page],[data-kind],[data-fav],[data-item],[data-approve],[data-reject],[data-deliver],[data-cancel]');if(!b)return;if(b.dataset.page){page=b.dataset.page;location.hash=page;render();window.scrollTo(0,0)}else if(b.dataset.kind){kind=b.dataset.kind;market()}else if(b.dataset.fav){const id=+b.dataset.fav;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];localStorage.setItem('navo-favorites',JSON.stringify(favorites));if(page==='favorites')drawGrid();else b.setAttribute('aria-pressed',String(favorites.includes(id)))}else if(b.dataset.item)product(+b.dataset.item);else try{if(b.dataset.approve||b.dataset.reject)await api('admin/payments',{id:+(b.dataset.approve||b.dataset.reject),approve:!!b.dataset.approve});else await api('admin/rentals',{id:+(b.dataset.deliver||b.dataset.cancel),deliver:!!b.dataset.deliver});toast('Yangilandi.');admin()}catch(err){toast(err.message)}});
document.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[data-item]:not(button)')){e.preventDefault();product(+e.target.dataset.item)}});$('#modal').addEventListener('close',()=>{activeInvoice=null;document.body.classList.remove('modal-open')});$('.close').onclick=()=>$('#modal').close();$('#modal').onclick=e=>{if(e.target===$('#modal'))$('#modal').close()};$('#help').onclick=()=>show('<h2>Yordam markazi</h2><p>To‘lov va ijara bo‘yicha yordam uchun ilova ochilgan Telegram botiga yozing.</p><p class="hint">Buyurtma raqami yoki tranzaksiya hashini ko‘rsating.</p>');window.Telegram?.WebApp?.ready();window.Telegram?.WebApp?.expand();page=[...links,['admin']].some(x=>x[0]===location.hash.slice(1))?location.hash.slice(1):'market';await load();render();$('#main').setAttribute('aria-busy','false');$('#startup').remove();

document.addEventListener('click',event=>{const id=event.target.closest('[data-relink]')?.dataset.relink;if(!id)return;show('<h2>Fragment ulanishi</h2><label class="stack">Yangi Tonkeeper havolasi<input id="newlink" type="url"></label><button class="primary" id="retrylink">Ulash</button>');$('#retrylink').onclick=async()=>{try{await api('partner/reconnect',{id,link:$('#newlink').value});$('#modal').close();rentals()}catch(e){toast(e.message)}}});
