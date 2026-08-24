import { generateVapidKeys } from '../api/_lib/webpush.js';

const keys = generateVapidKeys();
console.log('================================================================');
console.log('PRAGYAN INSTITUTE — GENERATED VAPID KEYS (RFC 8292)');
console.log('================================================================');
console.log('VAPID_PUBLIC_KEY:');
console.log(keys.publicKey);
console.log('\nVAPID_PRIVATE_KEY:');
console.log(keys.privateKey);
console.log('================================================================\n');
