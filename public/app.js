import './gift-motion.js';
const startupStarted=performance.now();
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
function highlights() {return products.filter(p=>p.kind==='gift'&&(p.image||imageKey(p))).slice(0,3)}
function featureHtml() {
  const gifts=highlights();
  if(!gifts.length)return '';
  featured=Math.min(featured,gifts.length-1);
  const p=gifts[featured];
  return `<section class="hero" style="--feature:${p.color}"><div class="hero-text"><span class="eyebrow">SIZNING YANGI USLUBINGIZ</span><h2>${esc(p.name)}</h2><p>Telegram profilingizga o‘ziga xos ko‘rinish.</p><span class="hero-price">${ton(p.price)} TON <small>/ kun</small></span><button class="primary" id="explore">NFT haqida</button></div><div class="hero-art" aria-hidden="true"><img style="border-radius:18px;height:80%" src="${esc(p.image||'art/'+imageKey(p)+'.webp')}" alt="">${motion(p)}</div><div class="slides">${gifts.map((g,i)=>`<button data-slide="${i}" aria-label="${esc(g.name)}" aria-pressed="${i===featured}"></button>`).join('')}</div></section>`;
}
const links=[['market','▦','Bozor'],['favorites','♡','Saqlanganlar'],['rentals','◷','Ijaralarim'],['wallet','◈','Hamyon'],['profile','◎','Profil']];
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').style.display='none',4500)}
async function api(path,body){const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':window.Telegram?.WebApp?.initData||''},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error||'Xatolik yuz berdi');return data}
function nav(){const all=user?.admin?[...links,['admin','⚙','Boshqaruv']]:links;$('#nav').innerHTML=all.map(([p,icon,label])=>`<button data-page="${p}" class="${page===p?'active':''}"><span class="ico">${icon}</span>${label}</button>`).join('');$('#balance').textContent=ton((user?.balance||0)/1e6);$('#mode').textContent=user?'Telegram Mini App':'Ko‘rib chiqish';$('#crumb').textContent=all.find(x=>x[0]===page)?.[2]||'Bozor'}
function heading(title,subtitle){return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div><span class="live">Navo Market</span></div>`}
function art(p) {
  const key = imageKey(p);
  const visual = p.image ? `<img loading="lazy" class="nft-model" style="width:100%;height:100%;object-fit:cover" src="${esc(p.image)}" alt="${esc(p.name)}">` : key ? `<img loading="lazy" class="nft-model" src="art/${key}.webp" alt="${esc(p.name)}" decoding="async">` :
    `<span class="art-text">${esc(p.kind==='gift'?'✧':p.emoji)}</span>`;
  return `<div class="art" style="--color:${p.color}"><span class="badge">${p.snapshot?'KATALOG NUSXASI':p.demo?'NAMUNA':p.available?'IJARAGA TAYYOR':'BAND'}</span>${visual}${motion(p)}</div>`;
}
function empty(title,desc,icon='✧'){return `<div class="empty"><span>${icon}</span><h2>${title}</h2><p>${desc}</p></div>`}
function market(){const favorite=page==='favorites',liveCount=products.filter(p=>p.source==='marketapp'&&!p.snapshot).length;const catalogNote=favorite?'':marketLive?`<div class="catalog-note catalog-note-live"><span class="catalog-note-icon">✦</span><span><b>MarketApp bilan jonli katalog</b><small>${sums(liveCount)} ta mavjud ijara taklifi · ro‘yxat yangilanib turadi</small></span><span class="catalog-live-pill">JONLI</span></div>`:`<div class="catalog-note catalog-note-preview"><span class="catalog-note-icon">✧</span><span><b>MarketApp namuna katalogi</b><small>Hozircha ko‘rgazma sovg‘alari ko‘rinmoqda. Jonli ijara takliflari API ulangach chiqadi.</small></span></div>`;$('#main').innerHTML=heading(favorite?'Saqlanganlar':'Kolleksiyalar bozori',favorite?'Yoqtirgan kolleksiyalaringiz bir joyda.':'Telegram sovg‘alari va MarketApp’dagi ijara takliflari.')+catalogNote+(!favorite?featureHtml():'')+`<div class="section-title">${favorite?'Tanlangan kolleksiyalar':'Ijara katalogi'}<small id="count"></small></div><div class="searchbar"><label class="search">⌕ <input id="q" type="search" placeholder="Sovg‘a, @username yoki raqam qidirish…" aria-label="Qidirish" value="${esc(query)}"></label><button class="secondary" id="reset">Tozalash</button></div><div class="filters"><div class="tabs">${[['all','Hammasi'],['gift','Sovg‘alar'],['username','Username'],['number','Raqamlar']].map(([v,t])=>`<button data-kind="${v}" class="${v===kind?'selected':''}">${t}</button>`).join('')}</div><div class="filters-right"><label><input id="free" type="checkbox" ${free?'checked':''}> Faqat bo‘shlari</label><select id="sort" aria-label="Saralash"><option value="new">Yangilari birinchi</option><option value="cheap">Avval arzonlari</option><option value="expensive">Avval qimmatlari</option></select></div></div><div class="collection-strip" id="collection-strip">${['',...new Set(products.filter(p=>p.kind==='gift').map(collectionName))].map(n=>`<button data-collection="${esc(n)}" class="${collection===n?'selected':''}">${esc(n||'Barcha kolleksiyalar')}</button>`).join('')}</div><div class="grid" id="grid"></div><button class="secondary load-more" id="load-more">Yana ko‘rsatish</button><p class="hint">${products.some(p=>p.demo)?'Namuna kolleksiyalar. Haqiqiy aktivlar administrator tomonidan qo‘shiladi.':''}</p>`;$('#sort').value=sort;$('#load-more').onclick=()=>{visibleCount+=24;drawGrid()};$('#collection-strip').onclick=e=>{const b=e.target.closest('[data-collection]');if(b){collection=b.dataset.collection;visibleCount=24;market()}};drawGrid();$('#q').oninput=e=>{query=e.target.value;visibleCount=24;drawGrid()};$('#free').onchange=e=>{free=e.target.checked;drawGrid()};$('#sort').onchange=e=>{sort=e.target.value;drawGrid()};$('#reset').onclick=()=>{query='';kind='all';free=false;sort='new';collection='';visibleCount=24;market()};if($('#explore'))$('#explore').onclick=()=>product(highlights()[featured].id);document.querySelectorAll('[data-slide]').forEach(button=>button.onclick=()=>{featured=Number(button.dataset.slide);market()})}
function drawGrid(){let list=products.filter(p=>(page!=='favorites'||favorites.includes(p.id))&&(kind==='all'||p.kind===kind)&&(!free||p.available)&&(!collection||collectionName(p)===collection)&&`${p.name} ${p.serial}`.toLowerCase().includes(query.toLowerCase()));if(sort!=='new')list.sort((a,b)=>sort==='cheap'?a.price-b.price:b.price-a.price);$('#count').textContent=`${list.length} ta kolleksiya`;$('#grid').innerHTML=list.length?list.slice(0,visibleCount).map(p=>`<article class="card" data-item="${p.id}" tabindex="0" role="button" aria-label="${esc(p.name)}">${art(p).replace('</div>',`<button class="heart" data-fav="${p.id}" aria-label="Saqlash" aria-pressed="${favorites.includes(p.id)}">${favorites.includes(p.id)?'♥':'♡'}</button></div>`)}<div class="card-info"><div class="item-title">${esc(p.name)} </div><div class="meta">${esc(p.serial)}</div><div class="card-price"><span class="price">${ton(p.price)} <small>TON / kun</small></span><span class="rent-icon">＋</span></div></div></article>`).join(''):empty('Hech narsa topilmadi','Qidiruv yoki filtrlarni o‘zgartiring.');$('#load-more').hidden=list.length<=visibleCount;}
function show(content){$('#modal-body').innerHTML=content;$('#modal').showModal()}
function ton(n){return new Intl.NumberFormat('en',{maximumFractionDigits:9}).format(n)}
function partnerProduct(p) {
  const live=!p.snapshot && p.available && user && config.marketapp_checkout;
  show(art(p)+`<h2>${esc(p.name)}</h2><p>${ton(p.price)} TON / kun · MarketApp</p>
    <label class="stack">Ijara muddati (${p.minDays}–${p.maxDays} kun)<input id="days" type="number" min="${p.minDays}" max="${p.maxDays}" value="${p.minDays}"></label>
    <div class="summary">Taxminiy ijara <b id="total"></b></div>
    ${live?`<p class="hint">Yakuniy narxga tranzaksiya va tarmoq xarajatlari kiradi.</p><label class="stack">Fragment ulanish havolasi<input id="connect-link" type="url" placeholder="https://app.tonkeeper.com/ton-connect…"></label><p class="hint">Fragment’da Connect TON → Tonkeeper’ni tanlang va QR kod ostidagi havolani kiriting.</p><button class="primary" id="partner-buy">Yakuniy narxni hisoblash</button>`:`<p class="hint">${p.snapshot?'MarketApp katalogidan saqlangan narx. Mavjudlik va yakuniy narx buyurtma vaqtida tekshiriladi.':'Ijara uchun sozlangan Telegram ilovasidan kiring.'}</p><a href="https://marketapp.org/nft/${encodeURIComponent(p.address)}/?to=rent" target="_blank" rel="noopener noreferrer">MarketApp’da ko‘rish</a>`}`);
  let quote=null;
  const button=$('#partner-buy'),days=$('#days');
  function update(){
    quote=null;$('#total').textContent=days.checkValidity()&&days.value?ton(p.price*Number(days.value))+' TON':'—';
    if(button)button.textContent='Yakuniy narxni hisoblash';
  }
  days.oninput=update;update();if(!live)return;
  button.onclick=async()=>{
    if(!days.value||!days.reportValidity())return;
    button.disabled=true;days.disabled=true;
    try {
      if(!quote || quote.deadline<=Date.now()/1000){
        quote=await api('partner/quote',{product_id:p.id,days:Number(days.value)});
        $('#total').textContent=ton(quote.total_micro/1e6)+' TON';
        button.textContent=ton(quote.total_micro/1e6)+' TON to‘lash';return;
      }
      const order=await api('partner/rent',{quote_id:quote.id,link:$('#connect-link').value.trim()});
      $('#modal').close();page='rentals';await load();render();toast(status(order.state));
    }catch(err){toast(err.message)}finally{button.disabled=false;days.disabled=false}
  };
}
function product(id){const p=products.find(x=>x.id===id);if(!p)return;if(p.source==='marketapp')return partnerProduct(p);show(art(p)+`<h2>${esc(p.name)}</h2><p>Telegram profilingizga o‘ziga xos ko‘rinish.</p><span class="hero-price">${ton(p.price)} TON <small>/ kun</small></span><label class="stack">Ijara muddati<select id="days">${[1,3,7,14,30].map(d=>`<option value="${d}">${d} kun</option>`).join('')}</select></label><div class="summary">Jami narx <b id="total">${p.price.toFixed(2)} TON</b></div><p class="hint">To‘lov balansdan olinadi. Aktiv administrator tomonidan beriladi; ijara muddati aktiv berilgandan keyin boshlanadi.</p><button class="primary" id="rent">Ijaraga olish</button><p class="hint">${p.demo?'Bu namuna aktiv, ijaraga berilmaydi.':''}</p>`);$('#days').onchange=e=>$('#total').textContent=(p.price*+e.target.value).toFixed(2)+' TON';$('#rent').onclick=async()=>{if(p.demo)return toast('Namuna aktiv. Administrator haqiqiy aktivlarni qo‘shishi kerak.');if(!user)return toast('Ijaraga olish uchun ilovani Telegram bot orqali oching.');try{const result=await api('rent',{product_id:p.id,days:+$('#days').value});user.balance=result.balance;$('#modal').close();toast('Buyurtma qabul qilindi. Aktiv berilishini kuting.');await load();render()}catch(e){toast(e.message)}}}
let paymentRows=[],paymentBusy=false,activeInvoice=null;
function paymentHistory(){return paymentRows.length?paymentRows.map(p=>`<div class="row payment-row"><span class="payment-symbol">${p.method==='stars'?'★':'◇'}</span><div class="payment-detail"><b>${ton(p.amount)} ${p.method==='stars'?'Stars':'TON'}</b><small>${new Date(p.created_at*1000).toLocaleString('uz-UZ')}</small></div><span class="pill ${p.status==='approved'?'success':''}">${p.status==='expired'?'Muddati tugagan':status(p.status)}</span>${p.method==='ton'&&p.status==='pending'?`<button class="secondary" data-payment="${p.id}">Ochish</button>`:''}</div>`).join(''):empty('Hali to‘lov yo‘q','To‘lovlar va ularning holati shu yerda ko‘rinadi.','◇')}
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
function openTonInvoice(p){
 activeInvoice=p.id;
 const memo=p.memo||p.reference,nano=p.nano||String(Math.round(p.amount*1e6)*1000);
 const url='https://app.tonkeeper.com/transfer/'+encodeURIComponent(p.wallet)+'?'+new URLSearchParams({amount:nano,text:memo});
 show(`<div class="invoice-mark">◇</div><span class="eyebrow">TON TO‘LOVI</span><h2>${ton(p.amount)} TON</h2><p id="invoice-status" role="status">Blokcheyn tasdig‘i kutilmoqda…</p><div id="invoice-actions"><p class="hint">TON mainnet tarmog‘ida aynan shu summa va izoh bilan yuboring. Izohsiz yoki boshqa summadagi o‘tkazma avtomatik hisoblanmaydi.</p><label class="stack">Qabul qiluvchi<input readonly value="${esc(p.wallet)}"></label><button class="copy-value secondary" data-copy="${esc(p.wallet)}">Manzilni nusxalash</button><label class="stack">To‘lov izohi<input readonly value="${esc(memo)}"></label><button class="copy-value secondary" data-copy="${esc(memo)}">Izohni nusxalash</button><a class="primary pay-link" href="${esc(url)}" target="_blank" rel="noopener">Tonkeeper’da to‘lash</a></div><p class="hint">Tasdiqlash odatda bir necha daqiqa davom etadi. Bu oynani yopishingiz mumkin — tekshirish serverda davom etadi.</p>`);
 refreshPayments();
}
async function wallet(){
 if(user)try{paymentRows=await api('payments')}catch(e){toast(e.message)}
 if(page!=='wallet')return;
 $('#main').innerHTML=heading('Hamyon','To‘ldiring. Tasdiqni kuzating. Ijarani boshlang.')+`<div class="two-col wallet-layout"><section class="panel balance-panel"><div class="balance-top"><span class="eyebrow">SIZNING BALANSINGIZ</span><span class="wallet-seal">◇</span></div><div class="large-balance"><span data-wallet-balance>${ton((user?.balance||0)/1e6)}</span> <small>TON</small></div><p>Sevimli sovg‘angiz uchun tayyor.</p><div class="wallet-note">★ Stars <span>◇ TON</span></div><p class="hint" id="payment-sync">Tasdiqlangan to‘lovdan keyin balans avtomatik yangilanadi.</p></section><form class="panel stack" id="topup"><h2>Balansni to‘ldirish</h2><fieldset class="payment-methods"><legend>To‘lov usuli</legend><label><input type="radio" name="method" value="stars" ${config.stars_enabled?'checked':''} ${!config.stars_enabled?'disabled':''}><span><b>★ Stars</b><small>Telegram orqali</small></span></label><label><input type="radio" name="method" value="ton" ${!config.stars_enabled&&config.ton_auto?'checked':''} ${!config.ton_auto?'disabled':''}><span><b>◇ TON</b><small>TON hamyonidan</small></span></label></fieldset><label>Summa <input name="amount" type="number" inputmode="decimal" required></label><div class="amount-presets" id="amount-presets"></div><div class="summary">Balansga tushadi <b id="credit-preview">—</b></div><p class="hint" id="rate-note"></p>${!config.stars_enabled||!config.ton_auto?`<p class="hint">${!config.stars_enabled?'Stars to‘lovlari hali ulanmagan. ':''}${!config.ton_auto?'TON to‘lovlari hali ulanmagan.':''}</p>`:''}<button class="primary" ${!config.stars_enabled&&!config.ton_auto?'disabled':''}>To‘lovni davom ettirish</button><p class="hint">Balans faqat tasdiqlangan to‘lov bo‘yicha to‘ldiriladi.</p></form></div><section class="panel"><div class="history-title"><h2>To‘lovlar tarixi</h2><button class="secondary" id="refresh-payments">Yangilash</button></div><div id="payment-history">${paymentHistory()}</div></section>`;
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
async function rentals(){let list=[];if(user)try{list=await api('rentals')}catch(e){toast(e.message)}$('#main').innerHTML=heading('Ijaralarim','Aktivlaringiz va ijara muddatlari.')+`<section class="panel">${list.length?list.map(r=>`<div class="row"><div><b>${esc(r.name)}</b><small>${r.days} kun · ${(r.total/1e6).toFixed(2)} TON${r.ends_at?' · '+new Date(r.ends_at*1000).toLocaleDateString('uz-UZ'):''}</small></div><span class="pill">${status(r.status)}</span>${r.status==='needs_link'?`<button class="secondary" data-relink="${esc(r.id)}">Qayta ulash</button>`:''}</div>`).join(''):empty('Hali ijara yo‘q','Bozordan o‘zingizga mos kolleksiyani tanlang.','◷')}</section>`}
function profile(){$('#main').innerHTML=heading('Profil','Navo Market’dagi shaxsiy sahifangiz.')+`<section class="panel"><h2>${esc(user?.name||'Xush kelibsiz!')}</h2><p>${user?'Telegram ID: '+user.id:'Ilovani Telegram ichidan ochib, hisobingizga kiring.'}</p><p class="hint">Telegram ma’lumotlari serverda tekshiriladi. Ijara va balans hisobingizga bog‘lanadi.</p><button class="primary" data-page="market">Bozorga o‘tish</button></section>`}
async function admin(){try{const data=await api('admin');$('#main').innerHTML=heading('Boshqaruv','To‘lovlarni tasdiqlang va aktivlarni boshqaring.')+`<section class="panel"><h2>Kutilayotgan to‘lovlar</h2>${data.payments.length?data.payments.map(p=>`<div class="row"><div>#${p.id} · ${esc(p.name)} · ${p.amount} ${esc(p.method)}<small>${esc(p.reference)}</small></div><div class="admin-actions"><button data-approve="${p.id}">Tasdiqlash</button><button data-reject="${p.id}">Rad etish</button></div></div>`).join(''):'Kutilayotgan to‘lovlar yo‘q.'}</section><section class="panel"><h2>Aktivni berish</h2>${data.rentals.length?data.rentals.map(r=>`<div class="row"><div>#${r.id} · ${esc(r.name)}<small>User ${r.user_id} · ${r.days} kun</small></div><div class="admin-actions"><button data-deliver="${r.id}">${r.status==='returning'?'Aktiv qaytarildi':'Berildi'}</button>${r.status==='pending'?`<button data-cancel="${r.id}">Bekor qilish + qaytarish</button>`:''}</div></div>`).join(''):'Kutilayotgan buyurtmalar yo‘q.'}</section><form id="add-product" class="panel stack"><h2>Kolleksiya qo‘shish</h2><label>Nomi<input name="name" required maxlength="70"></label><label>Turi<select name="kind"><option value="gift">Sovg‘a</option><option value="username">Username</option><option value="number">Raqam</option></select></label><label>Raqami / izohi<input name="serial" required maxlength="80"></label><label>Kunlik narx (TON)<input name="price" type="number" min="0.000001" step="0.000001" required></label><label>Belgi (emoji yoki username)<input name="emoji" required maxlength="30"></label><label>Rang<input name="color" type="color" value="#448e72"></label><button class="primary">Qo‘shish</button></form>`;$('#add-product').onsubmit=async e=>{e.preventDefault();try{await api('admin/products',Object.fromEntries(new FormData(e.target)));toast('Aktiv qo‘shildi.');await load();admin()}catch(err){toast(err.message)}}}catch(e){toast(e.message)}}
async function load(){try{const data=await api('bootstrap');marketLive=Boolean(data.partner_enabled);products=marketLive?data.products:[...snapshot,...data.products];user=data.user;config=data.config}catch{marketLive=false;products=snapshot;user=null;config={}}}
function render(){nav();if(page==='market'||page==='favorites')market();else if(page==='wallet')wallet();else if(page==='rentals')rentals();else if(page==='admin'&&user?.admin)admin();else profile()}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-page],[data-kind],[data-fav],[data-item],[data-approve],[data-reject],[data-deliver],[data-cancel]');if(!b)return;if(b.dataset.page){page=b.dataset.page;location.hash=page;render();window.scrollTo(0,0)}else if(b.dataset.kind){kind=b.dataset.kind;market()}else if(b.dataset.fav){const id=+b.dataset.fav;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];localStorage.setItem('navo-favorites',JSON.stringify(favorites));drawGrid()}else if(b.dataset.item)product(+b.dataset.item);else try{if(b.dataset.approve||b.dataset.reject)await api('admin/payments',{id:+(b.dataset.approve||b.dataset.reject),approve:!!b.dataset.approve});else await api('admin/rentals',{id:+(b.dataset.deliver||b.dataset.cancel),deliver:!!b.dataset.deliver});toast('Yangilandi.');admin()}catch(err){toast(err.message)}});
document.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[data-item]')){e.preventDefault();product(+e.target.dataset.item)}});$('#modal').addEventListener('close',()=>{activeInvoice=null});$('.close').onclick=()=>$('#modal').close();$('#modal').onclick=e=>{if(e.target===$('#modal'))$('#modal').close()};$('#help').onclick=()=>show('<h2>Yordam markazi</h2><p>To‘lov va ijara bo‘yicha yordam uchun ilova ochilgan Telegram botiga yozing.</p><p class="hint">Buyurtma raqami yoki tranzaksiya hashini ko‘rsating.</p>');window.Telegram?.WebApp?.ready();window.Telegram?.WebApp?.expand();page=links.some(x=>x[0]===location.hash.slice(1))?location.hash.slice(1):'market';await load();render();await new Promise(resolve=>setTimeout(resolve,Math.max(0,1050-(performance.now()-startupStarted))));$('#main').setAttribute('aria-busy','false');$('#startup').classList.add('startup-leaving');setTimeout(()=>$('#startup').remove(),700);

document.addEventListener('click',event=>{const id=event.target.closest('[data-relink]')?.dataset.relink;if(!id)return;show('<h2>Fragment ulanishi</h2><label class="stack">Yangi Tonkeeper havolasi<input id="newlink" type="url"></label><button class="primary" id="retrylink">Ulash</button>');$('#retrylink').onclick=async()=>{try{await api('partner/reconnect',{id,link:$('#newlink').value});$('#modal').close();rentals()}catch(e){toast(e.message)}}});
