const maxHeadBytes = 65536;
const positiveTTL = 6 * 60 * 60 * 1000;
const missTTL = 60000;

export function telegramGiftSlug(title) {
  const match = /^([A-Za-z][A-Za-z0-9 ’'-]{0,95}?)\s*#([1-9]\d{0,11})$/.exec(String(title).trim());
  if (!match) return null;
  const slug = match[1].replace(/[ ’'-]/g, '');
  return slug.length <= 80 ? slug + '-' + match[2] : null;
}

async function readHead(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = '';
  try {
    while (bytes < maxHeadBytes) {
      const {value, done} = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, maxHeadBytes - bytes);
      html += decoder.decode(chunk, {stream:true});
      bytes += chunk.byteLength;
      const end = html.search(/<\/head\s*>/i);
      if (end >= 0) return html.slice(0, end);
    }
    return html + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function decodeMetadata(value) {
  return value.replace(/&(amp|apos|quot|rsquo|#\d{1,7}|#x[a-f\d]{1,6});/gi, (_, entity) => {
    const named = {amp:'&', apos:"'", quot:'"', rsquo:'’'};
    const key = entity.toLowerCase();
    if (key in named) return named[key];
    const code = key.startsWith('#x') ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

async function fetchPoster(fetchImpl, key) {
  const response = await fetchImpl('https://t.me/nft/' + key, {
    headers:{Accept:'text/html'}, redirect:'manual', signal:AbortSignal.timeout(5000)
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 404 || response.status === 410) return null;
    throw Error('Telegram poster unavailable');
  }
  const metadata = new Map();
  for (const [tag] of (await readHead(response)).matchAll(/<meta\s+[^>]{1,4096}>/gi)) {
    const attrs = new Map();
    for (const [, attr, , value] of tag.matchAll(/\s([a-z][\w:-]*)\s*=\s*(["'])([\s\S]*?)\2/gi)) {
      attrs.set(attr.toLowerCase(), decodeMetadata(value));
    }
    const name = attrs.get('property')?.toLowerCase();
    if (name && !metadata.has(name)) metadata.set(name, attrs.get('content'));
  }
  if (!metadata.has('og:title') && !metadata.has('og:image')) throw Error('Telegram metadata unavailable');
  if (telegramGiftSlug(metadata.get('og:title'))?.toLowerCase() !== key.toLowerCase()) return null;
  let image;
  try { image = new URL(metadata.get('og:image')); } catch { return null; }
  if (image.protocol !== 'https:' || image.username || image.password || image.port ||
      !/^cdn\d{1,2}\.(?:telesco\.pe|cdn-telegram\.org)$/.test(image.hostname) ||
      !/^\/file\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(image.pathname)) return null;
  return image.href;
}

export function createTelegramPosterLookup({fetchImpl = fetch} = {}) {
  const cache = new Map();
  const pending = new Map();
  const queue = [];
  let active = 0;

  return async function lookup(slug, serial) {
    if (typeof slug !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(slug) ||
        !/^[1-9]\d{0,11}$/.test(String(serial))) return null;
    const key = slug + '-' + serial;
    const normalized = key.toLowerCase();
    const cached = cache.get(normalized);
    if (cached?.until > Date.now()) return cached.url;
    cache.delete(normalized);
    if (pending.has(normalized)) return pending.get(normalized);
    if (pending.size >= 48) throw Error('Telegram poster lookup queue is full');

    let slot;
    if (active < 3) {
      active++;
      slot = Promise.resolve();
    } else {
      slot = new Promise(resolve => queue.push(resolve));
    }
    const request = slot.then(() => fetchPoster(fetchImpl, key)).then(url => {
      if (cache.size >= 1024) cache.delete(cache.keys().next().value);
      cache.set(normalized, {url, until:Date.now() + (url ? positiveTTL : missTTL)});
      return url;
    }).finally(() => {
      pending.delete(normalized);
      if (queue.length) queue.shift()();
      else active--;
    });
    pending.set(normalized, request);
    return request;
  };
}
