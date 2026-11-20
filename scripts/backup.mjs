import { DatabaseSync } from 'node:sqlite';
import { chmodSync,existsSync,mkdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const source=resolve(process.env.DB_PATH || fileURLToPath(new URL('../navo.sqlite',import.meta.url)));
if(!existsSync(source))throw Error('Database file not found.');
if(!process.argv[2])throw Error('Specify a new backup file path outside the deployment directory.');
const dest=resolve(process.argv[2]);
if(existsSync(dest)||dest===source)throw Error('Choose a new filename for the backup.');
mkdirSync(dirname(dest),{recursive:true,mode:0o700});
process.umask(0o077);
const db=new DatabaseSync(source,{readOnly:true});
try{db.exec('PRAGMA busy_timeout=10000');db.prepare('VACUUM INTO ?').run(dest)}finally{db.close()}
chmodSync(dest,0o600);
const snapshot=new DatabaseSync(dest,{readOnly:true});
try{
  if(snapshot.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup integrity check failed.');
}finally{snapshot.close()}
console.log('Verified SQLite backup:',dest);
