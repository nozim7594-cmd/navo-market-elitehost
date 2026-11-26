import './gift-motion.js';
import {walletConnector} from './wallet-connect.js';

const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products=[],user=null,config={},marketLive=false,page='market',kind='all',query='',sort='new',free=false;
let favorites=JSON.parse(localStorage.getItem('navo-favorites')||'[]');
const snapshot = await fetch('catalog.json').then(r=>r.json()).catch(()=>[]);
const savedGifts = new Map(snapshot.filter(p => p.address).map(p => [p.address, p]));
const imageFor = p => p.image || savedGifts.get(p.address)?.image;
function motion(p) {
  const file = savedGifts.get(p.address)?.motion || p.motion;
  return file ? `<gift-motion aria-hidden="true" data-file="${esc(file)}"></gift-motion>` : '';
}
const sums=n=>new Intl.NumberFormat('uz-UZ').format(n);
let featured = 0, collection = '', visibleCount = 24;
const collectionName = p => p.name.replace(/\s*#\d+$/, '').trim();
const giftColor = p => /^#[a-f\d]{6}$/i.test(p.color) ? p.color : '#536477';
const giftNumber = p => p.name.match(/#\d+$/)?.[0] || (p.source === 'marketapp' ? '' : p.serial || '');

function poster(p, {priority = false, grid = false, alt = ''} = {}) {
  const src = imageFor(p);
  const token = p.source === 'marketapp' && /^https:\/\//.test(src) && p.name.match(/^([a-z0-9 ’'–-]+?)\s*#(\d+)$/i);
  const backup = token && '/art/telegram/' + token[1].toLowerCase().replace(/[^a-z0-9]/g, '') + '-' + token[2];
  return `<img src="${esc(src)}" alt="${esc(alt)}" decoding="async"${priority ? ' fetchpriority="high"' : ''}${grid ? ' class="nft-model" loading="lazy"' : ''}${backup ? ` data-backup="${esc(backup)}"` : ''} data-gift-poster>`;
}
document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.hasAttribute('data-gift-poster')) return;
  if (image.dataset.backup) {
    const backup = image.dataset.backup;
    delete image.dataset.backup;
    image.src = backup;
    return;
  }
  const unavailable = document.createElement('span');
  unavailable.className = 'poster-unavailable';
  unavailable.innerHTML = icon('gift') + '<small>Rasm yuklanmadi</small>';
  image.replaceWith(unavailable);
}, true);

function featuredGifts() {
  const byCollection = new Map();
  for (const gift of products) {
    if (gift.kind !== 'gift' || !gift.available || !imageFor(gift)) continue;
    const name = collectionName(gift);
    if (!byCollection.has(name)) byCollection.set(name, gift);
  }
  const preferred = ['Plush Pepe', 'Astral Shard', 'Eternal Rose', 'Heart Locket', 'Jelly Bunny'];
  const ordered = new Set([...preferred, ...byCollection.keys()]);
  return [...ordered].filter(name => byCollection.has(name)).slice(0, 3).map(name => byCollection.get(name));
}

function collectionShowcase(choices) {
  if (!choices.length) return '';
  featured = Math.min(featured, choices.length - 1);
  const gift = choices[featured];
  const serial = giftNumber(gift);
  const rail = choices.map((item, index) => `
    <button type="button" class="pick" data-spotlight="${index}" aria-pressed="${index === featured}" aria-label="${esc(item.name)}">
      <span class="pick-thumb" style="--gift:${giftColor(item)}">${poster(item)}</span>
      <span class="pick-description"><strong>${esc(collectionName(item))}</strong><small>${ton(item.price)} TON / kun</small></span>
      <span class="pick-indicator" aria-hidden="true"></span>
    </button>`).join('');
  return `<section class="spotlight" aria-label="Tanlangan sovg‘alar">
    <div class="spotlight-main">
      <div class="spotlight-copy">
        <span class="spotlight-label">${icon('spark')} Tanlangan NFT</span>
        <h2>${esc(collectionName(gift))}</h2>
        ${serial ? `<span class="spotlight-serial">${esc(serial)}</span>` : ''}
        <div class="spotlight-offer"><span class="spotlight-price">${icon('ton')}<strong>${ton(gift.price)} TON</strong><small>/ kun</small></span>
          <button type="button" class="spotlight-action" data-item="${gift.id}">${gift.snapshot || gift.demo ? 'Ko‘rish' : 'Ijaraga olish'}</button>
        </div>
      </div>
      <div class="spotlight-stage" style="--gift:${giftColor(gift)}">
        <button type="button" class="specimen" data-item="${gift.id}" aria-label="${esc(gift.name)}">
          ${poster(gift, {priority:true})}
        </button>
      </div>
    </div>
    ${choices.length > 1 ? `<div class="pick-rail" role="group" aria-label="Sovg‘ani tanlash">${rail}</div>` : ''}
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
function art(p) {
  const source = imageFor(p);
  const visual = source ? poster(p, {grid:true, alt:p.name}) :
    `<span class="art-text">${p.kind === 'gift' ? icon('gift') : esc(p.emoji)}</span>`;
  const status = p.snapshot ? 'Ko‘rgazma' : p.demo ? 'Namuna' : p.available ? 'Bo‘sh' : 'Band';
  return `<div class="art" style="--color:${giftColor(p)}"><span class="badge ${p.available && !p.snapshot && !p.demo ? 'available' : ''}">${status}</span>${visual}</div>`;
}
function empty(title,desc,icon='✧'){return `<div class="empty"><span>${icon}</span><h2>${title}</h2><p>${desc}</p></div>`}
function market() {
  const saved = page === 'favorites';
  const choices = saved ? [] : featuredGifts();
  const collections = [...new Set(products.filter(p => p.kind === 'gift').map(collectionName))].sort();
  const filterCount = Number(Boolean(collection)) + Number(kind !== 'all') + Number(sort !== 'new');
  const option = ([value,label],current) => `<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`;
  const title = saved ? 'Saqlanganlar' : 'Sovg‘alar';
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
  const showcase = $('.spotlight');
  if (showcase) {
    showcase.onclick = event => {
      const control = event.target.closest('[data-spotlight]');
      if (!control) return;
      featured = Number(control.dataset.spotlight);
      const template = document.createElement('template');
      template.innerHTML = collectionShowcase(choices);
      showcase.replaceChildren(...template.content.firstElementChild.childNodes);
      showcase.querySelector(`[data-spotlight="${featured}"]`).focus({preventScroll:true});
    };
  }
  $('#load-more').onclick=()=>{visibleCount+=24;drawGrid()};
  drawGrid();
}

function giftCard(p) {
  const serial = giftNumber(p);
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
    (!free||(p.available&&!p.snapshot&&!p.demo))&&(!collection||collectionName(p)===collection)&&
    `${p.name} ${displaySerial(p)}`.toLowerCase().includes(search));
  if(sort!=='new') list.sort((a,b)=>sort==='cheap'?a.price-b.price:b.price-a.price);
  $('#count').textContent=`${sums(list.length)} ta`;
  $('#grid').innerHTML=list.length ? list.slice(0,visibleCount).map(giftCard).join('') :
    empty(page==='favorites'&&!favorites.length?'Saqlangan sovg‘alar yo‘q':'Hech narsa topilmadi',
      page==='favorites'&&!favorites.length?'Yoqtirgan sovg‘angizdagi yurakchani bosing.':'Qidiruv yoki filtrlarni o‘zgartiring.');
  $('#load-more').hidden=list.length<=visibleCount;
}
function show(content){
  const modal = $('#modal');
  const body = $('#modal-body');
  body.innerHTML = content;
  const title = body.querySelector('h2');
  if (title) {
    title.id ||= 'dialog-title';
    modal.setAttribute('aria-labelledby', title.id);
  } else {
    modal.removeAttribute('aria-labelledby');
  }
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
  document.body.classList.add('modal-open');
}
function ton(n){return new Intl.NumberFormat('en',{maximumFractionDigits:9}).format(n)}

function rentalDetail(p) {
  const partner = p.source === 'marketapp';
  const minimum = partner ? p.minDays : 1;
  const maximum = partner ? p.maxDays : 30;
  const standardTerms = [1, 3, 7, 14, 30];
  const terms = [...new Set([minimum, ...standardTerms])].filter(d => d >= minimum && d <= maximum);
  const serial = giftNumber(p);
  const preview = p.snapshot || p.demo;
  const available = !preview && p.available;
  const checkoutEnabled = !partner || config.marketapp_checkout;
  const bookable = available && user && checkoutEnabled;
  const botName = String(config.bot_username || '').trim().replace(/^@/, '');
  const guestLink = available && !user && checkoutEnabled && /^[a-z][a-z0-9_]{4,31}$/i.test(botName)
    ? 'https://t.me/' + botName : '';
  const state = preview ? 'Ko‘rgazma' : available ? 'Ijaraga tayyor' : 'Band';
  const message = preview ? 'Ko‘rgazmadagi aktivni hozircha ijaraga olib bo‘lmaydi.'
    : !available ? 'Bu aktiv hozir ijarada.'
    : !checkoutEnabled ? 'Ijara vaqtincha yopiq.'
    : guestLink ? 'Ijara uchun bot menyusidan bozorni oching.'
    : !user ? 'Ijaraga olish uchun Telegram bot orqali kiring.'
    : 'To‘lov TON balansingizdan yechiladi.';
  const estimate = partner && !bookable;
  const range = minimum === maximum ? minimum : minimum + '–' + maximum;
  const totalFor = days => ton(p.price * days) + ' TON';

  const animation = motion(p);
  const duration = partner ? `
    <div class="detail-stepper">
      <button type="button" data-step="-1" aria-label="Bir kun kamaytirish">−</button>
      <input type="number" id="days" inputmode="numeric" aria-describedby="term-range" min="${minimum}" max="${maximum}" step="1" required value="${minimum}">
      <button type="button" data-step="1" aria-label="Bir kun qo‘shish">${icon('plus')}</button>
    </div>` : `
    <select id="days">${standardTerms.map(d => `<option value="${d}">${d} kun</option>`).join('')}</select>`;

  show(`<div class="asset-detail">
    <div class="asset-detail-scroll">
      <div class="detail-media">
        ${art(p)}
        ${animation ? '<button type="button" class="detail-motion" aria-label="Animatsiyani ko‘rish" title="Animatsiyani ko‘rish" data-playing="false"><i aria-hidden="true"></i></button>' : ''}
      </div>
      <div class="detail-intro">
        <div class="detail-state" data-ready="${Boolean(available)}"><i aria-hidden="true"></i>${state}</div>
        <h2 id="asset-name">${esc(collectionName(p))}</h2>
        ${serial ? `<span class="detail-serial">${esc(serial)}</span>` : ''}
        <p class="detail-rate">${icon('ton')} <strong>${ton(p.price)} TON</strong> <span>/ kun</span></p>
      </div>
      <div class="detail-fields">
        <div class="detail-duration">
          <div><label for="days">Ijara muddati</label>${partner ? `<small id="term-range">${range} kun</small>` : ''}</div>
          ${duration}
        </div>
        ${partner && terms.length > 1 ? `<div class="detail-presets" role="group" aria-label="Muddatni tanlash">${terms.map(d => `<button type="button" data-term="${d}" aria-pressed="${d === minimum}">${d} kun</button>`).join('')}</div>` : ''}
        ${bookable && partner ? `<div class="detail-link">
          <label for="connect-link">Fragment ulanish havolasi</label>
          <input id="connect-link" type="url" required placeholder="https://app.tonkeeper.com/ton-connect…" autocapitalize="none" spellcheck="false">
        </div>` : ''}
      </div>
    </div>
    <div class="detail-footer">
      <div class="detail-total">
        <span>${estimate ? 'Taxminiy jami' : 'Jami to‘lov'} <span aria-hidden="true">·</span> <span id="chosen-days">${minimum} kun</span></span>
        <strong id="total" aria-live="polite">${partner && bookable ? 'Hisoblanmoqda…' : totalFor(minimum)}</strong>
      </div>
      ${bookable ? `<button type="button" class="detail-action" id="${partner ? 'partner-buy' : 'rent'}" ${partner ? 'disabled' : ''}>Ijaraga olish ${icon('next')}</button>`
        : guestLink ? `<a class="detail-action" href="${esc(guestLink)}" target="_blank" rel="noopener noreferrer">Telegram’da ochish ${icon('arrow')}</a>`
        : `<button type="button" class="detail-action detail-save" data-fav="${esc(p.id)}" aria-pressed="${favorites.includes(p.id)}">${icon('favorites')}<span class="save-off">Saqlash</span><span class="save-on">Saqlangan</span></button>`}
      <p class="detail-message" id="detail-message" role="status">${message}</p>
    </div>
  </div>`);

  const modal = $('#modal');
  const media = modal.querySelector('.detail-media');
  const toggle = media.querySelector('.detail-motion');
  if (toggle) {
    const stage = media.querySelector('.art');
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    function stopAnimation() {
      stage.querySelector('gift-motion')?.remove();
      toggle.dataset.playing = 'false';
      toggle.title = 'Animatsiyani ko‘rish';
      toggle.setAttribute('aria-label', toggle.title);
    }
    toggle.onclick = () => {
      if (preference.matches || stage.querySelector('gift-motion')) return stopAnimation();
      stage.insertAdjacentHTML('beforeend', animation);
      toggle.dataset.playing = 'true';
      toggle.title = 'Animatsiyani to‘xtatish';
      toggle.setAttribute('aria-label', toggle.title);
    };
    const onPreferenceChange = event => { if (event.matches) stopAnimation(); };
    preference.addEventListener('change', onPreferenceChange);
    modal.addEventListener('close', () => {
      stopAnimation();
      preference.removeEventListener('change', onPreferenceChange);
    }, {once:true});
  }
  const days = $('#days');
  const total = $('#total');
  const chosen = $('#chosen-days');
  const notice = $('#detail-message');
  const buy = $('.asset-detail .detail-action');
  const link = $('#connect-link');
  const steps = [...modal.querySelectorAll('[data-step]')];
  const presets = [...modal.querySelectorAll('[data-term]')];
  let quote = null;
  let revision = 0;
  let quoteTimer;
  let submitting = false;
  let quoteFailed = false;
  const active = () => modal.open && days.isConnected;
  function updateControls() {
    const value = Number(days.value);
    days.disabled = submitting;
    if (link) link.disabled = submitting;
    for (const step of steps) {
      step.disabled = submitting || (Number(step.dataset.step) < 0 ? value <= minimum : value >= maximum);
    }
    for (const term of presets) {
      term.disabled = submitting;
      term.setAttribute('aria-pressed', String(term.dataset.term === days.value));
    }
    if (bookable) buy.disabled = submitting || !days.validity.valid || (partner && !quote && !quoteFailed);
  }
  async function refreshQuote() {
    const request = ++revision;
    quote = null;
    quoteFailed = false;
    total.textContent = 'Hisoblanmoqda…';
    updateControls();
    try {
      const result = await api('partner/quote', {product_id:p.id, days:Number(days.value)});
      if (request !== revision || !active()) return;
      quote = result;
      total.textContent = ton(result.total_micro / 1e6) + ' TON';
      buy.innerHTML = 'Ijaraga olish ' + icon('next');
    } catch (error) {
      if (request !== revision || !active()) return;
      quoteFailed = true;
      total.textContent = '—';
      notice.textContent = error.message;
      buy.textContent = 'Narxni yangilash';
    }
    updateControls();
  }
  function updateDuration() {
    clearTimeout(quoteTimer);
    revision++;
    quote = null;
    quoteFailed = false;
    const valid = days.validity.valid && days.value;
    chosen.textContent = (valid ? days.value : '—') + ' kun';
    notice.textContent = valid ? message : minimum + '–' + maximum + ' kun oralig‘ida muddat kiriting.';
    updateControls();
    if (!valid) {
      total.textContent = '—';
    } else if (bookable && partner) {
      total.textContent = 'Hisoblanmoqda…';
      buy.innerHTML = 'Ijaraga olish ' + icon('next');
      quoteTimer = setTimeout(refreshQuote, 240);
    } else {
      total.textContent = totalFor(Number(days.value));
    }
  }
  for (const step of steps) step.onclick = () => {
    const next = (Number(days.value) || minimum) + Number(step.dataset.step);
    days.value = Math.max(minimum, Math.min(maximum, next));
    updateDuration();
  };
  for (const term of presets) term.onclick = () => {
    days.value = term.dataset.term;
    updateDuration();
  };
  days.addEventListener(partner ? 'input' : 'change', updateDuration);
  modal.addEventListener('close', () => {clearTimeout(quoteTimer); revision++}, {once:true});
  updateControls();
  if (!bookable) return;
  if (partner) void refreshQuote();

  buy.onclick = async () => {
    if (submitting || !days.reportValidity()) return;
    if (partner && !quote) {
      notice.textContent = message;
      return refreshQuote();
    }
    if (link && !link.reportValidity()) return;
    submitting = true;
    updateControls();
    try {
      if (partner) {
        if (quote.deadline <= Date.now() / 1000) {
          const previous = quote.total_micro;
          await refreshQuote();
          if (!active() || !quote) return;
          if (previous !== quote.total_micro) {
            notice.textContent = 'Narx yangilandi. Yangi summani tekshiring.';
            return;
          }
        }
        buy.textContent = 'Yuborilmoqda…';
        const order = await api('partner/rent', {quote_id:quote.id, link:link.value.trim()});
        if (active()) modal.close();
        page = 'rentals';
        location.hash = page;
        await load();
        render();
        toast(status(order.state));
      } else {
        buy.textContent = 'Yuborilmoqda…';
        const result = await api('rent', {product_id:p.id, days:Number(days.value)});
        user.balance = result.balance;
        if (active()) modal.close();
        toast('Buyurtma qabul qilindi.');
        await load();
        render();
      }
    } catch (error) {
      if (active()) notice.textContent = error.message;
      else toast(error.message);
    } finally {
      submitting = false;
      if (!quoteFailed) buy.innerHTML = 'Ijaraga olish ' + icon('next');
      updateControls();
    }
  };
}
function product(id) {
  const item = products.find(p => p.id === id);
  if (item) rentalDetail(item);
}
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
async function wallet() {
  if (user) {
    try { paymentRows = await api('payments'); } catch (error) { toast(error.message); }
  }
  if (page !== 'wallet') return;

  const starsEnabled = Boolean(config.stars_enabled);
  const tonEnabled = Boolean(config.ton_auto);
  const paymentsEnabled = starsEnabled || tonEnabled;
  $('#main').innerHTML = `<div class="account-page wallet-page">
    <div class="account-heading"><h1>Hamyon</h1></div>
    <div class="account-wallet-grid">
      <div class="account-wallet-left">
        <section class="account-panel account-balance-card" aria-labelledby="balance-title">
          <div class="account-card-mark" aria-hidden="true">${icon('ton')}</div>
          <h2 id="balance-title">Mavjud balans</h2>
          <p class="account-balance"><strong data-wallet-balance>${ton((user?.balance || 0) / 1e6)}</strong><span>TON</span></p>
          <p class="account-balance-note" id="payment-sync">To‘lov tasdiqlangach, balans avtomatik yangilanadi.</p>
        </section>
        <section class="account-panel account-connection" aria-labelledby="connection-title">
          <div class="account-connection-heading">
            <span class="account-icon">${icon('wallet')}</span>
            <div><h2 id="connection-title">TON hamyoni</h2><p id="connected-address" aria-live="polite">Tonkeeper yoki boshqa TON hamyonini tanlang.</p></div>
          </div>
          <div class="account-actions">
            <button class="account-secondary" id="connect-wallet">Hamyonni ulash</button>
            <button class="account-secondary" id="disconnect-wallet" hidden>Uzish</button>
          </div>
        </section>
      </div>
      <form class="account-panel account-topup" id="topup">
        <h2>Balansni to‘ldirish</h2>
        <fieldset class="account-methods"><legend>To‘lov usuli</legend><div class="account-method-grid">
          <label><input type="radio" name="method" value="stars" ${starsEnabled ? 'checked' : 'disabled'}><span>${icon('star')} Stars</span></label>
          <label><input type="radio" name="method" value="ton" ${tonEnabled ? (starsEnabled ? '' : 'checked') : 'disabled'}><span>${icon('ton')} TON</span></label>
        </div></fieldset>
        <label class="account-amount">Summa
          <span><input name="amount" type="number" inputmode="decimal" required ${paymentsEnabled ? '' : 'disabled'}><b id="amount-unit"></b></span>
        </label>
        <div class="account-presets" id="amount-presets"></div>
        <div class="account-credit"><span>Balansga tushadi</span><b id="credit-preview" aria-live="polite">—</b></div>
        <p class="account-hint" id="rate-note"></p>
        <button class="account-primary" type="submit" ${paymentsEnabled ? '' : 'disabled'}>To‘lovni davom ettirish ${icon('next')}</button>
      </form>
    </div>
    <section class="account-panel account-history">
      <div class="account-section-heading"><h2>To‘lovlar tarixi</h2><button class="account-secondary" id="refresh-payments">${icon('reset')} Yangilash</button></div>
      <div id="payment-history">${paymentHistory()}</div>
    </section>
  </div>`;
  updateConnectedWallet();
  $('#connect-wallet').onclick = async () => {
    try {
      const ui = await walletConnector();
      if (ui.connected) await ui.disconnect();
      await ui.openModal();
    } catch { toast('Hamyonni ulab bo‘lmadi. Qayta urinib ko‘ring.'); }
  };
  $('#disconnect-wallet').onclick = async () => {
    try {
      await (await walletConnector()).disconnect();
      await updateConnectedWallet();
    } catch { toast('Qayta urinib ko‘ring.'); }
  };

  const form = $('#topup');
  const amount = form.elements.amount;
  const presets = $('#amount-presets');
  function preview() {
    const value = Number(amount.value);
    const stars = form.elements.method.value === 'stars';
    const credit = stars ? (config.stars_credit_micro ? value * config.stars_credit_micro / 1e6 : value / config.stars_per_ton) : value;
    $('#credit-preview').textContent = paymentsEnabled && value > 0 ? ton(credit) + ' TON' : '—';
    for (const button of presets.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(value === Number(button.dataset.amount)));
    }
  }
  function method() {
    if (!paymentsEnabled) {
      $('#rate-note').textContent = 'To‘lov usullari hozircha mavjud emas.';
      return;
    }
    const stars = form.elements.method.value === 'stars';
    amount.min = stars ? '1' : '0.01';
    amount.max = stars ? '100000' : '10000';
    amount.step = stars ? '1' : '0.000001';
    amount.value = stars ? '100' : '1';
    $('#amount-unit').textContent = stars ? 'Stars' : 'TON';
    presets.innerHTML = (stars ? [100, 250, 500, 1000] : [1, 2, 5, 10])
      .map(n => `<button type="button" data-amount="${n}">${n}</button>`).join('');
    $('#rate-note').textContent = stars
      ? `100 Stars = ${ton(config.stars_ton_per_100 || 100 / config.stars_per_ton)} TON. Kurs to‘lov yaratilganda belgilanadi.`
      : 'TON mainnet. Tarmoq komissiyasi hamyoningizda ko‘rsatiladi.';
    preview();
  }
  form.onchange = event => { if (event.target.name === 'method') method(); };
  amount.oninput = preview;
  presets.onclick = event => {
    if (event.target.dataset.amount) {
      amount.value = event.target.dataset.amount;
      preview();
    }
  };
  method();
  $('#refresh-payments').onclick = refreshPayments;
  form.onsubmit = async event => {
    event.preventDefault();
    if (!user) return toast('To‘lov uchun Telegram bot orqali kiring.');
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await api('payments', {method: form.elements.method.value, amount: Number(amount.value)});
      if (result.invoice_url) {
        if (window.Telegram?.WebApp?.openInvoice) window.Telegram.WebApp.openInvoice(result.invoice_url, () => refreshPayments());
        else location.href = result.invoice_url;
      } else openTonInvoice(result);
      await refreshPayments();
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  };
}
document.addEventListener('click',async e=>{const copy=e.target.closest('[data-copy]');if(copy){try{await navigator.clipboard.writeText(copy.dataset.copy);toast('Nusxalandi.')}catch{toast('Maydondagi matnni belgilab, nusxalang.')}}const pay=e.target.closest('[data-payment]');if(pay){const p=paymentRows.find(p=>p.id===Number(pay.dataset.payment));if(p)openTonInvoice(p)}});
setInterval(refreshPayments,5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPayments()});
function status(s){return ({checking:'Blokcheyn tasdig‘i kutilmoqda',connecting:'Fragment ulanmoqda',needs_link:'Yangi Fragment havolasi kerak',sending:'Tranzaksiya yuborilmoqda',queued:'Navbatda',transferring:'NFT yetkazilmoqda',ready:'Fragment ulanishi kutilmoqda',completed:'Yakunlangan',pending:'Kutilmoqda',paid:'To‘langan',approved:'Tasdiqlangan',rejected:'Rad etilgan',active:'Faol',returning:'Qaytarish kutilmoqda',expired:'Yakunlangan',cancelled:'Bekor qilingan'})[s]||s}
async function rentals() {
  let list = [];
  let errorMessage = '';
  if (user) {
    try { list = await api('rentals'); } catch (error) { errorMessage = error.message; }
  }
  if (page !== 'rentals') return;
  const history = list.map(r => `<div class="account-rental-row">
    <span class="account-icon">${icon('rentals')}</span>
    <div class="account-rental-detail"><b>${esc(r.name)}</b>
      <small>${esc(r.days)} kun · ${ton(r.total / 1e6)} TON${r.ends_at ? ' · Tugash sanasi ' + new Date(r.ends_at * 1000).toLocaleDateString('uz-UZ') : ''}</small></div>
    <span class="account-status status-${esc(r.status)}">${esc(status(r.status))}</span>
    ${r.status === 'needs_link' ? `<button class="account-secondary" data-relink="${esc(r.id)}">Qayta ulash</button>` : ''}
  </div>`).join('');
  $('#main').innerHTML = `<div class="account-page rentals-page">
    <div class="account-heading"><h1>Ijaralarim</h1></div>
    <section class="account-panel account-rentals">
      ${errorMessage ? `<div class="account-empty"><h2>Ijaralarni yuklab bo‘lmadi</h2><p>${esc(errorMessage)}</p>
        <button class="account-secondary" data-page="rentals">${icon('reset')} Qayta urinish</button></div>`
      : list.length ? `<div class="account-section-heading"><h2>Ijara tarixi</h2><span class="account-count">${list.length}</span></div>${history}`
      : `<div class="account-empty">
          <span class="account-empty-icon">${icon('rentals')}</span>
          <h2>Hali ijara yo‘q</h2>
          <p>${user ? 'Bozordan sovg‘a tanlab, ijarani boshlang.' : 'Ijaralaringizni ko‘rish uchun ilovani Telegram bot orqali oching.'}</p>
          <button class="account-primary" data-page="market">Bozorga o‘tish ${icon('next')}</button>
        </div>`}
    </section>
  </div>`;
}
function profile() {
  const name = user?.name || 'Mehmon';
  const initial = Array.from(name.trim())[0] || '?';
  const destinations = [
    ['wallet', 'Hamyon'], ['rentals', 'Ijaralarim'], ['favorites', 'Saqlanganlar'],
    ...(user?.admin ? [['admin', 'Admin panel']] : [])
  ];
  $('#main').innerHTML = `<div class="account-page profile-page">
    <div class="account-heading"><h1>Profil</h1></div>
    <div class="account-profile-grid">
      <section class="account-panel account-identity">
        <div class="account-identity-mark" aria-hidden="true">${user ? esc(initial.toLocaleUpperCase()) : icon('profile')}</div>
        <h2>${esc(name)}</h2>
        <p>${user ? 'Telegram ID · ' + esc(user.id) : 'Hisobingizga kirish uchun ilovani Telegram bot orqali oching.'}</p>
      </section>
      <section class="account-panel account-profile-links">
        <h2>Hisobim</h2>
        ${destinations.map(([id, label]) => `<button class="account-profile-link" data-page="${id}">
          <span class="account-icon">${icon(id)}</span><strong>${label}</strong>${icon('next')}
        </button>`).join('')}
        <button class="account-secondary" data-page="market">${icon('market')} Bozorga o‘tish</button>
      </section>
    </div>
  </div>`;
}
async function adminBalances(q = '') {
  const panel = $('#balance-admin');
  if (!panel) return;
  const search = panel.querySelector('#admin-user-search');
  const data = await api('admin/users?' + new URLSearchParams({q}));
  if (!panel.isConnected || search.value !== q) return;

  panel.querySelector('.admin-ledger-list').innerHTML = data.users.map(u => `
    <div class="admin-ledger-row">
      <div class="admin-person"><span class="admin-initial" aria-hidden="true">${esc(Array.from(u.name || '?')[0].toUpperCase())}</span><div><b>${esc(u.name)}</b><small>Telegram ID ${esc(u.id)}</small></div></div>
      <strong>${ton(u.balance / 1e6)} TON</strong>
      <button class="account-secondary" data-adjust="${esc(u.id)}" data-name="${esc(u.name)}">O‘zgartirish</button>
    </div>`).join('') || '<p class="admin-empty">Foydalanuvchi topilmadi.</p>';
  panel.querySelector('.admin-ledger-history').innerHTML = data.history.map(a => `
    <div class="admin-record">
      <div class="admin-line"><b>${esc(a.name)}</b><strong>${a.delta > 0 ? '+' : ''}${ton(a.delta / 1e6)} TON</strong></div>
      <small>ID ${esc(a.user_id)} · ${new Date(a.created_at * 1000).toLocaleString('uz-UZ')}</small>
      <span>${ton(a.before_balance / 1e6)} → ${ton(a.after_balance / 1e6)} TON</span><p>${esc(a.reason)}</p>
    </div>`).join('') || '<p class="admin-empty">O‘zgarishlar yo‘q.</p>';

  panel.onclick = e => {
    const button = e.target.closest('[data-adjust]');
    if (!button) return;
    const id = Number(button.dataset.adjust);
    show(`<h2>Balansni o‘zgartirish</h2><p>${esc(button.dataset.name)} · Telegram ID ${id}</p>
      <form id="balance-form" class="stack admin-dialog-form">
        <label>Amal<select name="direction"><option value="add">Balansga qo‘shish</option><option value="subtract">Balansdan ayirish</option></select></label>
        <label>Summa (TON)<input name="amount" type="number" inputmode="decimal" min="0.000001" max="1000" step="0.000001" required></label>
        <label>Sabab<input name="reason" maxlength="200" minlength="3" required></label>
        <button class="primary account-primary">Saqlash</button>
      </form>`);
    $('#balance-form').onsubmit = async event => {
      event.preventDefault();
      const form = event.target;
      const submit = form.querySelector('button');
      const amount = Number(form.elements.amount.value);
      const delta = form.elements.direction.value === 'subtract' ? -amount : amount;
      submit.disabled = true;
      try {
        await api('admin/balance', {user_id:id, delta, reason:form.elements.reason.value, request_id:crypto.randomUUID()});
        $('#modal').close();
        toast('Balans yangilandi.');
        await adminBalances(search.value);
      } catch (error) {
        toast(error.message);
      } finally {
        submit.disabled = false;
      }
    };
  };
}

async function adminWallets() {
  const panel = $('#wallet-settings');
  if (!user?.owner || !panel) return;
  const settings = await api('admin/wallets');
  if (!panel.isConnected) return;
  panel.innerHTML = `<h2>Hamyon manzillari</h2>
    <form id="wallet-settings-form" class="stack">
      <label>TON qabul qilish manzili<input name="deposit_address" required maxlength="100" spellcheck="false" autocomplete="off" value="${esc(settings.deposit_address)}">
        <small>Yangi to‘lovlar shu manzilga keladi. Avvalgi hisoblar eski manzil orqali tekshiriladi.</small></label>
      <label>Ijara uchun to‘lov hamyoni<input name="rental_address" maxlength="100" spellcheck="false" autocomplete="off" value="${esc(settings.rental_address)}">
        <small>Manzil serverdagi hamyon kalitiga mos bo‘lishi kerak. Hamyon almashtirilganda hostingdagi <code>MARKETAPP_WALLET_MNEMONIC</code> sozlamasini yangilang.</small></label>
      <button class="account-secondary">O‘zgarishlarni tekshirish</button>
    </form>
    <details class="admin-disclosure"><summary>Manzillar tarixi</summary>
      ${settings.history.map(row => `<div class="admin-record">
        <b>${new Date(row.created_at * 1000).toLocaleString('uz-UZ')} · ID ${esc(row.admin_id)}</b>
        <small>Qabul qilish</small><code>${esc(row.old_deposit || '—')} → ${esc(row.new_deposit)}</code>
        <small>Ijara</small><code>${esc(row.old_rental || '—')} → ${esc(row.new_rental || '—')}</code>
      </div>`).join('') || '<p class="admin-empty">O‘zgarishlar yo‘q.</p>'}
    </details>`;
  $('#wallet-settings-form').onsubmit = event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    show(`<h2>Manzillarni tasdiqlash</h2>
      <div class="admin-wallet-review"><b>TON qabul qilish</b><code>${esc(values.deposit_address)}</code><b>Ijara uchun to‘lov</b><code>${esc(values.rental_address || '—')}</code></div>
      <button class="primary account-primary" id="save-wallet-settings">Tasdiqlash va saqlash</button><p id="wallet-save-error" role="alert"></p>`);
    $('#save-wallet-settings').onclick = async event => {
      const button = event.currentTarget;
      const errorMessage = $('#wallet-save-error');
      button.disabled = true;
      try {
        await api('admin/wallets', {...values, revision:settings.revision});
        $('#modal').close();
        toast('Hamyon manzillari saqlandi.');
        await load();
        if (page === 'admin') await admin();
      } catch (error) {
        errorMessage.textContent = error.message;
        button.disabled = false;
      }
    };
  };
}

async function adminOrders() {
  const panel = $('#order-admin');
  if (!panel) return;
  const data = await api('admin/orders');
  if (!panel.isConnected) return;
  const orders = data.orders || [];
  const needsReview = new Set(['sending', 'checking', 'connecting', 'needs_link']);
  const issueCount = orders.filter(o => needsReview.has(o.state)).length;
  panel.innerHTML = `<div class="admin-line admin-panel-title">
      <div><h2>Ijara buyurtmalari</h2>${issueCount ? `<p>${issueCount} ta buyurtmani tekshirish kerak.</p>` : ''}</div>
      <button class="account-secondary" id="check-orders">${icon('reset')} Holatni tekshirish</button>
    </div><div class="admin-order-list">${orders.map(o => `
      <div class="admin-record">
        <div class="admin-line"><b>${esc(o.name)}</b><span class="admin-state${needsReview.has(o.state) ? ' needs-review' : ''}">${esc(status(o.state))}</span></div>
        <small>#${esc(o.id.slice(0,8))} · ${esc(o.customer)} · ID ${esc(o.user_id)}</small>
        <span>${esc(o.days)} kun · ${ton(o.total / 1e6)} TON</span>
        <small>${new Date(o.created * 1000).toLocaleString('uz-UZ')}${o.reviewed_at ? ' · Ko‘rib chiqilgan' : ''}</small>
        ${o.note ? `<p>${esc(o.note)}</p>` : ''}
        <button class="account-secondary" data-review-order="${esc(o.id)}">Izoh qo‘shish</button>
      </div>`).join('') || '<p class="admin-empty">Buyurtmalar yo‘q.</p>'}</div>`;
  $('#check-orders').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api('admin/orders/check', {});
      await adminOrders();
      toast('Holat yangilandi.');
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  };
  panel.onclick = e => {
    const id = e.target.closest('[data-review-order]')?.dataset.reviewOrder;
    if (!id) return;
    show(`<h2>Buyurtma izohi</h2><p>#${esc(id.slice(0,8))}</p>
      <form id="order-review-form" class="stack admin-dialog-form">
        <label>Tekshiruv natijasi<textarea name="note" required minlength="3" maxlength="300"></textarea></label>
        <button class="primary account-primary">Saqlash</button>
      </form>`);
    $('#order-review-form').onsubmit = async event => {
      event.preventDefault();
      const button = event.target.querySelector('button');
      button.disabled = true;
      try {
        await api('admin/orders/review', {id, note:event.target.elements.note.value});
        $('#modal').close();
        await adminOrders();
        toast('Izoh saqlandi.');
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    };
  };
}

async function admin() {
  try {
    const data = await api('admin');
    if (page !== 'admin' || !user?.admin) return;
    $('#main').innerHTML = `<div class="account-page admin-page">
      <div class="account-heading"><h1>Boshqaruv</h1><p>To‘lovlar, ijara buyurtmalari va hisoblar.</p></div>
      <div class="admin-grid">
        <section class="account-panel">
          <div class="admin-line admin-panel-title"><h2>Kutilayotgan to‘lovlar</h2><span class="admin-total">${data.payments.length}</span></div>
          ${data.payments.map(p => `<div class="admin-record">
            <div class="admin-line"><b>${esc(p.name)}</b><strong>${esc(p.amount)} ${esc(p.method)}</strong></div>
            <small>#${esc(p.id)} · ${esc(p.reference)}</small>
            <div class="admin-decision"><button class="account-secondary" data-approve="${esc(p.id)}">Tasdiqlash</button><button class="account-secondary" data-reject="${esc(p.id)}">Rad etish</button></div>
          </div>`).join('') || '<p class="admin-empty">Tasdiqlash uchun to‘lov yo‘q.</p>'}
        </section>
        <section class="account-panel">
          <div class="admin-line admin-panel-title"><h2>Aktivlarni topshirish</h2><span class="admin-total">${data.rentals.length}</span></div>
          ${data.rentals.map(r => `<div class="admin-record">
            <div class="admin-line"><b>${esc(r.name)}</b><strong>${esc(r.days)} kun</strong></div>
            <small>#${esc(r.id)} · Telegram ID ${esc(r.user_id)}</small>
            <div class="admin-decision"><button class="account-secondary" data-deliver="${esc(r.id)}">${r.status === 'returning' ? 'Aktiv qaytarildi' : 'Berildi'}</button>
              ${r.status === 'pending' ? `<button class="account-secondary" data-cancel="${esc(r.id)}">Bekor qilish va to‘lovni qaytarish</button>` : ''}</div>
          </div>`).join('') || '<p class="admin-empty">Topshirish yoki qaytarish uchun aktiv yo‘q.</p>'}
        </section>
        <section id="order-admin" class="account-panel admin-wide"><h2>Ijara buyurtmalari</h2><p class="admin-empty">Yuklanmoqda…</p></section>
        <section id="balance-admin" class="account-panel admin-wide">
          <h2>Foydalanuvchilar balansi</h2>
          <label class="admin-find"><span>Foydalanuvchini qidirish</span><input type="search" id="admin-user-search" maxlength="80" placeholder="Telegram ID yoki ism"></label>
          <div class="admin-ledger-list"><p class="admin-empty">Yuklanmoqda…</p></div>
          <details class="admin-disclosure"><summary>Balans o‘zgarishlari tarixi</summary><div class="admin-ledger-history"></div></details>
        </section>
        <section class="account-panel admin-wide">
          <h2>Kolleksiya qo‘shish</h2>
          <form id="add-product" class="stack admin-product-form">
            <label>Nomi<input name="name" required maxlength="70"></label>
            <label>Turi<select name="kind"><option value="gift">Sovg‘a</option><option value="username">Username</option><option value="number">Raqam</option></select></label>
            <label>Raqam yoki izoh<input name="serial" required maxlength="80"></label>
            <label>Kunlik narx (TON)<input name="price" type="number" min="0.000001" step="0.000001" required></label>
            <label>Belgi (emoji yoki username)<input name="emoji" required maxlength="30"></label>
            <label>Rang<input name="color" type="color" value="#448e72"></label>
            <button class="account-primary">Kolleksiya qo‘shish</button>
          </form>
        </section>
        ${user.owner ? '<section id="wallet-settings" class="account-panel admin-wide"><h2>Hamyon manzillari</h2><p class="admin-empty">Yuklanmoqda…</p></section>' : ''}
      </div></div>`;
    const search = $('#admin-user-search');
    let timer;
    search.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (search.isConnected) adminBalances(search.value).catch(error => toast(error.message));
      }, 300);
    };
    $('#add-product').onsubmit = async event => {
      event.preventDefault();
      const form = event.target;
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        await api('admin/products', Object.fromEntries(new FormData(form)));
        toast('Aktiv qo‘shildi.');
        await load();
        if (page === 'admin') await admin();
      } catch (error) {
        toast(error.message);
      } finally {
        button.disabled = false;
      }
    };
    await Promise.all([adminBalances(), adminOrders(), adminWallets()]);
  } catch (error) {
    toast(error.message);
  }
}
async function load(){try{const data=await api('bootstrap');marketLive=Boolean(data.partner_enabled);products=marketLive?data.products:[...snapshot,...data.products];user=data.user;config=data.config}catch{marketLive=false;products=snapshot;user=null;config={}}}
function render(){nav();if(page==='market'||page==='favorites')market();else if(page==='wallet')wallet();else if(page==='rentals')rentals();else if(page==='admin'&&user?.admin)admin();else profile()}
window.addEventListener('hashchange', () => {
  const requested = location.hash.slice(1);
  const nextPage = links.some(([id]) => id === requested) || (requested === 'admin' && user?.admin) ? requested : 'market';
  if (page === nextPage) return;
  if ($('#modal').open) $('#modal').close();
  page = nextPage;
  render();
  window.scrollTo(0, 0);
});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-page],[data-kind],[data-fav],[data-item],[data-approve],[data-reject],[data-deliver],[data-cancel]');if(!b)return;if(b.dataset.page){page=b.dataset.page;location.hash=page;render();window.scrollTo(0,0)}else if(b.dataset.kind){kind=b.dataset.kind;market()}else if(b.dataset.fav){const id=+b.dataset.fav;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];localStorage.setItem('navo-favorites',JSON.stringify(favorites));if(page==='favorites')drawGrid();document.querySelectorAll(`[data-fav="${id}"]`).forEach(control=>control.setAttribute('aria-pressed',String(favorites.includes(id))))}else if(b.dataset.item)product(+b.dataset.item);else try{if(b.dataset.approve||b.dataset.reject)await api('admin/payments',{id:+(b.dataset.approve||b.dataset.reject),approve:!!b.dataset.approve});else await api('admin/rentals',{id:+(b.dataset.deliver||b.dataset.cancel),deliver:!!b.dataset.deliver});toast('Yangilandi.');admin()}catch(err){toast(err.message)}});
document.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[data-item]:not(button)')){e.preventDefault();product(+e.target.dataset.item)}});$('#modal').addEventListener('close',()=>{activeInvoice=null;document.body.classList.remove('modal-open')});$('.close').onclick=()=>$('#modal').close();$('#modal').onclick=e=>{if(e.target===$('#modal'))$('#modal').close()};$('#help').onclick=()=>show('<h2>Yordam markazi</h2><p>To‘lov va ijara bo‘yicha yordam uchun ilova ochilgan Telegram botiga yozing.</p><p class="hint">Buyurtma raqami yoki tranzaksiya hashini ko‘rsating.</p>');window.Telegram?.WebApp?.ready();window.Telegram?.WebApp?.expand();page=[...links,['admin']].some(x=>x[0]===location.hash.slice(1))?location.hash.slice(1):'market';await load();render();$('#main').setAttribute('aria-busy','false');$('#startup').remove();

document.addEventListener('click',event=>{const id=event.target.closest('[data-relink]')?.dataset.relink;if(!id)return;show('<h2>Fragment ulanishi</h2><label class="stack">Yangi Tonkeeper havolasi<input id="newlink" type="url"></label><button class="primary" id="retrylink">Ulash</button>');$('#retrylink').onclick=async()=>{try{await api('partner/reconnect',{id,link:$('#newlink').value});$('#modal').close();rentals()}catch(e){toast(e.message)}}});
