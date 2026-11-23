import {cp,mkdir} from 'node:fs/promises';
await cp(new URL('../node_modules/@tonconnect/ui/dist/tonconnect-ui.min.js',import.meta.url),new URL('../public/vendor/tonconnect-ui.js',import.meta.url));
await cp(new URL('../node_modules/@tonconnect/ui/LICENSE',import.meta.url),new URL('../public/vendor/tonconnect-ui.LICENSE',import.meta.url));
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
await cp(new URL('../public/',import.meta.url),new URL('../dist/',import.meta.url),{recursive:true});
console.log('Static preview built. The Telegram backend runs with npm start.');
