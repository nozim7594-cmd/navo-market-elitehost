import {Address} from '@ton/ton';
import {merchantSigner} from './marketapp.mjs';

export function walletSettings({db, tx, env, validateSigner = merchantSigner}) {
  db.exec(`CREATE TABLE IF NOT EXISTS wallet_settings (
    id INTEGER PRIMARY KEY CHECK(id=1), deposit_address TEXT NOT NULL,
    rental_address TEXT NOT NULL, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS wallet_settings_history (
    id INTEGER PRIMARY KEY, admin_id INTEGER NOT NULL, created_at INTEGER NOT NULL,
    old_deposit TEXT NOT NULL, new_deposit TEXT NOT NULL,
    old_rental TEXT NOT NULL, new_rental TEXT NOT NULL);`);
  const stored = db.prepare('SELECT * FROM wallet_settings WHERE id=1').get();
  if (stored) apply(stored);

  function apply(row) {
    env.CRYPTO_WALLET = row.deposit_address;
    env.MARKETAPP_WALLET_ADDRESS = row.rental_address;
  }
  function snapshot() {
    const row = db.prepare('SELECT revision FROM wallet_settings WHERE id=1').get();
    return {
      deposit_address: env.CRYPTO_WALLET || '',
      rental_address: env.MARKETAPP_WALLET_ADDRESS || '',
      revision: row?.revision || 0,
      history: db.prepare('SELECT * FROM wallet_settings_history ORDER BY id DESC LIMIT 20').all()
    };
  }
  function fail(message, status = 400) { throw Object.assign(Error(message), {status}); }
  function address(value) {
    if (typeof value !== 'string' || value.length > 100) fail('TON manzilini tekshiring.');
    try {
      const text = value.trim();
      if (Address.isFriendly(text) && Address.parseFriendly(text).isTestOnly) throw Error();
      const parsed = Address.parse(text);
      if (parsed.workChain !== 0) throw Error();
      return parsed.toString({bounceable: false, testOnly: false});
    } catch { fail('Mainnet TON hamyon manzilini kiriting.'); }
  }
  async function save(adminId, input) {
    const deposit = address(input.deposit_address);
    const rental = input.rental_address ? address(input.rental_address) : '';
    if (!Number.isSafeInteger(input.revision)) fail('Sozlamalarni qayta oching.', 409);
    const previous = snapshot();
    if (previous.revision !== input.revision) fail('Sozlamalar o‘zgargan. Sahifani yangilang.', 409);
    if (rental !== (previous.rental_address ? address(previous.rental_address) : '')) {
      if (!rental) fail('Ijara hamyoni manzilini kiriting.');
      // Derive and match the configured signer. This never broadcasts a transfer.
      await validateSigner({...env, MARKETAPP_WALLET_ADDRESS: rental});
    }
    tx(() => {
      const current = snapshot();
      if (current.revision !== input.revision) fail('Sozlamalar o‘zgargan. Sahifani yangilang.', 409);
      if (rental !== (current.rental_address ? address(current.rental_address) : '') && db.prepare("SELECT 1 FROM marketapp_orders WHERE state IN ('sending','checking','connecting')").get()) {
        fail('Ijara to‘lovi tekshirilmoqda. Yakunlangach hamyonni o‘zgartiring.', 409);
      }
      db.prepare('INSERT INTO wallet_settings VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET deposit_address=excluded.deposit_address,rental_address=excluded.rental_address,revision=excluded.revision').run(deposit, rental, current.revision + 1);
      db.prepare('INSERT INTO wallet_settings_history(admin_id,created_at,old_deposit,new_deposit,old_rental,new_rental) VALUES(?,?,?,?,?,?)').run(adminId, Math.floor(Date.now()/1000), current.deposit_address, deposit, current.rental_address, rental);
    });
    apply({deposit_address: deposit, rental_address: rental});
    return snapshot();
  }
  return {snapshot, save};
}
