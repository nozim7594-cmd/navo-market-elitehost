import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {createTelegramPosterLookup} from '../telegram-poster.mjs';

const poster = 'https://cdn1.telesco.pe/file/Example_Poster-0123456789.jpg';

function giftPage(title, image = poster) {
  return new Response(`<!doctype html><html><head>
    <meta property="og:title" content="${title}">
    <meta property="og:image" content="${image}">
  </head></html>`, {headers:{'content-type':'text/html; charset=utf-8'}});
}

test('uses the official collectible page and returns the poster for that exact gift', async () => {
  const calls = [];
  const lookup = createTelegramPosterLookup({fetchImpl:async url => {
    calls.push(String(url));
    return giftPage('Astral Shard #372');
  }});
  assert.equal(await lookup('AstralShard', 372), poster);
  assert.deepEqual(calls, ['https://t.me/nft/AstralShard-372']);
});

test('matches collection names containing an encoded apostrophe', async () => {
  const lookup = createTelegramPosterLookup({fetchImpl:async () => giftPage('Durov&#39;s Cap #12')});
  assert.equal(await lookup('DurovsCap', 12), poster);
});

test('treats unavailable pages, missing metadata and other collectibles as absent', async t => {
  const pages = [
    ['missing page', () => new Response(null, {status:404})],
    ['missing title', () => new Response(`<meta property="og:image" content="${poster}">`)],
    ['missing image', () => new Response('<meta property="og:title" content="Astral Shard #372">')],
    ['generic Telegram page', () => giftPage('Telegram')],
    ['different serial', () => giftPage('Astral Shard #3720')],
    ['different collection', () => giftPage('Crystal Ball #372')]
  ];
  for (const [label, page] of pages) await t.test(label, async () => {
    const lookup = createTelegramPosterLookup({fetchImpl:async () => page()});
    assert.equal(await lookup('AstralShard', 372), null);
  });
});

test('accepts HTTPS poster URLs only from the Telegram CDN', async t => {
  const images = [
    ['lookalike host', 'https://cdn1.telesco.pe.example.org/file/Example.jpg'],
    ['unrelated host', 'https://example.org/file/Example.jpg'],
    ['unencrypted URL', 'http://cdn1.telesco.pe/file/Example.jpg'],
    ['relative URL', '/file/Example.jpg']
  ];
  for (const [label, image] of images) await t.test(label, async () => {
    const lookup = createTelegramPosterLookup({fetchImpl:async () => giftPage('Astral Shard #372', image)});
    assert.equal(await lookup('AstralShard', 372), null);
  });
});

test('rejects unusable lookup keys before contacting Telegram', async () => {
  let calls = 0;
  const lookup = createTelegramPosterLookup({fetchImpl:async () => {
    calls++;
    return giftPage('Astral Shard #372');
  }});
  for (const [slug, serial] of [
    ['', 372], ['Astral/Shard', 372], ['x'.repeat(1024), 372],
    ['AstralShard', 0], ['AstralShard', -1], ['AstralShard', 1.5],
    ['AstralShard', Number.MAX_SAFE_INTEGER + 1]
  ]) assert.equal(await lookup(slug, serial), null);
  assert.equal(calls, 0);
});

test('shares concurrent lookups, caches successes and keeps serials separate', async () => {
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const lookup = createTelegramPosterLookup({fetchImpl:async url => {
    calls++;
    await gate;
    const serial = new URL(url).pathname.split('-').at(-1);
    return giftPage(`Astral Shard #${serial}`, poster.replace('Example', serial));
  }});
  const first = lookup('AstralShard', 372);
  const second = lookup('astralshard', 372);
  release();
  const expected = poster.replace('Example', '372');
  assert.deepEqual(await Promise.all([first, second]), [expected, expected]);
  assert.equal(await lookup('AstralShard', 372), expected);
  assert.equal(calls, 1);
  assert.equal(await lookup('AstralShard', 373), poster.replace('Example', '373'));
  assert.equal(calls, 2);
});

test('retries after a transient transport failure', async () => {
  let calls = 0;
  const lookup = createTelegramPosterLookup({fetchImpl:async () => {
    if (++calls === 1) throw new Error('Connection interrupted');
    return giftPage('Astral Shard #372');
  }});
  await assert.rejects(() => lookup('AstralShard', 372));
  assert.equal(await lookup('AstralShard', 372), poster);
  assert.equal(calls, 2);
});

test('treats HTTP 200 pages without Open Graph metadata as retryable', async () => {
  let calls = 0;
  const lookup = createTelegramPosterLookup({fetchImpl:async () => {
    if (++calls === 1) return new Response('<!doctype html><title>Please try again</title>');
    return giftPage('Astral Shard #372');
  }});
  await assert.rejects(() => lookup('AstralShard', 372));
  assert.equal(await lookup('AstralShard', 372), poster);
  assert.equal(calls, 2);
});

test('limits simultaneous Telegram fetches while completing queued lookups', async () => {
  let active = 0;
  let peak = 0;
  const lookup = createTelegramPosterLookup({fetchImpl:async url => {
    active++;
    peak = Math.max(peak, active);
    await setImmediate();
    active--;
    const serial = new URL(url).pathname.split('-').at(-1);
    return giftPage(`Astral Shard #${serial}`);
  }});
  const requests = Array.from({length:12}, (_, i) => lookup('AstralShard', i + 1));
  assert.deepEqual(await Promise.all(requests), Array(12).fill(poster));
  assert.ok(peak <= 3, `Observed ${peak} concurrent Telegram requests`);
});

test('public GET and HEAD resolve only existing partner gifts and preserve listing capitalization', async t => {
  const {createServer} = await import('node:http');
  const {makeApp} = await import('../server.mjs');
  const request = globalThis.fetch;
  const upstream = [];
  const rows = ['Astral Shard #372', 'UFC Strike #9', 'Toy Bear #84'].map((nft_name, index) => ({
    nft_name, nft_address:'EQ' + String(index + 1).repeat(46), price_per_day:'1000000',
    min_duration:86400, max_duration:259200
  }));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.startsWith('https://api.marketapp.org/')) return Response.json({items:rows});
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, undefined);
    upstream.push(url);
    if (url.endsWith('/UFCStrike-9')) return new Response('<html><head></head></html>');
    if (url.endsWith('/ToyBear-84')) return giftPage('Toy Bear #85');
    return giftPage('Astral Shard #372');
  });
  const app = makeApp({dbPath:':memory:', env:{MARKETAPP_API_TOKEN:'fixture'}});
  const server = createServer(app.handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    app.close();
  });
  const get = (key, method = 'GET') => request('http://127.0.0.1:' + server.address().port + '/art/telegram/' + key, {method,redirect:'manual'});

  assert.equal((await get('AstralShard-371')).status, 404);
  assert.equal((await get('AstralShard-0372')).status, 404);
  assert.deepEqual(upstream, []);
  const success = await get('astralshard-372');
  assert.equal(success.status, 302);
  assert.equal(success.headers.get('location'), poster);
  assert.match(success.headers.get('cache-control'), /max-age=\d+/);
  const head = await get('AstralShard-372', 'HEAD');
  assert.equal(head.status, 302);
  assert.equal(await head.text(), '');
  assert.deepEqual(upstream, ['https://t.me/nft/AstralShard-372']);
  const throttled = await get('ufcstrike-9');
  assert.equal(throttled.status, 503);
  assert.ok(Number(throttled.headers.get('retry-after')) > 0);
  assert.equal(upstream.at(-1), 'https://t.me/nft/UFCStrike-9');
  assert.equal((await get('ToyBear-84')).status, 404);
  assert.equal((await get('AstralShard-372', 'POST')).status, 405);
});
