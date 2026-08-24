// ============================================================================
// PRAGYAN INSTITUTE — ZERO-DEPENDENCY WEB PUSH CORE (RFC 8291 / RFC 8292)
// ----------------------------------------------------------------------------
// Implements the exact subset of Web Push needed by this project using ONLY
// node:crypto, so the platform stays free of third-party runtime deps:
//
//   • VAPID (RFC 8292): ES256 JWT ("vapid t=…, k=…") Authorization scheme.
//   • Payload encryption (RFC 8291, content coding "aes128gcm"): ephemeral
//     ECDH-P256 + HKDF-SHA256 + AES-128-GCM.
//
// Everything here is deterministic per the RFCs; tests/security-hardening
// style crypto assertions in tests/push-notifications.test.js verify the
// wire format structurally (header magic, signature shape, decrypt round-trip).
// ============================================================================

import crypto from 'crypto';

/* ── base64url helpers ─────────────────────────────────────────────────── */
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const b64uDec = (str) => Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Raw 65-byte uncompressed P-256 point (0x04 ‖ X ‖ Y) from a KeyObject. */
function rawPublic(keyObj) {
  const der = keyObj.export({ type: 'spki', format: 'der' });
  return der.subarray(der.length - 65);
}

function jwkFromRawPoint(raw) {
  const b = Buffer.from(raw);
  return { kty: 'EC', crv: 'P-256', x: b.subarray(1, 33).toString('base64url'), y: b.subarray(33, 65).toString('base64url') };
}

/* ── RFC 8292 — VAPID ──────────────────────────────────────────────────── */

/**
 * Generate an application server keypair.
 * publicKey : base64url of the 65-byte uncompressed point (goes to browsers).
 * privateKey: base64url PKCS8 DER (server-only secret).
 */
export function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    publicKey: b64u(rawPublic(publicKey)),
    privateKey: b64u(privateKey.export({ type: 'pkcs8', format: 'der' }))
  };
}

/** Minimal DER ECDSA-Sig-Value → 64-byte fixed-width r‖s (JOSE/ES256 form). */
function derToRawSignature(der) {
  let offset = 2;                          // skip 0x30 + total-length
  const rLen = der[offset + 1];
  const r = der.subarray(offset + 2, offset + 2 + rLen);
  const sOff = offset + 2 + rLen;
  const sLen = der[sOff + 1];
  const s = der.subarray(sOff + 2, sOff + 2 + sLen);
  const out = Buffer.alloc(64);
  r.copy(out, 32 - Math.min(32, r.length), r.length - Math.min(32, r.length));
  s.copy(out, 64 - Math.min(32, s.length), s.length - Math.min(32, s.length));
  return out;
}

/** ES256-sign a compact JWS with the VAPID private key (PKCS8 b64url). */
function es256Jwt(claims, privateKeyB64) {
  const key = crypto.createPrivateKey({
    key: b64uDec(privateKeyB64), format: 'der', type: 'pkcs8'
  });
  const signingInput = [
    b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))),
    b64u(Buffer.from(JSON.stringify(claims)))
  ].join('.');
  const raw = derToRawSignature(crypto.sign('sha256', Buffer.from(signingInput), key));
  return `${signingInput}.${b64u(raw)}`;
}

/**
 * Build the RFC 8292 Authorization header for one push endpoint.
 * @param {string} endpoint  full https push-service URL (audience = its origin)
 * @param {{publicKey:string,privateKey:string}} keys
 * @param {string} subject   e.g. 'mailto:ops@example.com'
 */
export function vapidAuthorizationHeader(endpoint, keys, subject) {
  const audience = new URL(endpoint).origin;
  const claims = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject
  };
  const jwt = es256Jwt(claims, keys.privateKey);
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

/* ── RFC 8291 — payload encryption ("aes128gcm") ───────────────────────── */

const WEBPUSH_INFO_PREFIX = Buffer.from('WebPush: info\x00', 'utf8');
const RS_RECORD_SIZE = 4096;

/**
 * Encrypt a JSON payload string for one subscription.
 * @param {{p256dh:string, auth:string}} subKeys  browser-provided keys (b64url)
 * @param {string} payloadString
 * @returns {{headers:Record<string,string>, body:Buffer}}
 */
export function encryptPayload(subKeys, payloadString) {
  const plaintext = Buffer.from(String(payloadString ?? ''), 'utf8');
  if (plaintext.length > RS_RECORD_SIZE - 17) {
    throw new Error(`Web push payload too large after encoding (${plaintext.length}B; max ${RS_RECORD_SIZE - 17}B)`);
  }

  const clientPub = b64uDec(subKeys.p256dh);
  const authSecret = b64uDec(subKeys.auth);
  if (clientPub.length !== 65 || clientPub[0] !== 0x04) {
    throw new Error('Invalid p256dh key (expected 65-byte uncompressed point)');
  }

  // Ephemeral sender keypair for this one message.
  const ephemeral = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const ephPubRaw = rawPublic(ephemeral.publicKey);

  const clientPubKeyObj = crypto.createPublicKey({ key: jwkFromRawPoint(clientPub), format: 'jwk' });
  const ecdhSecret = Buffer.from(
    crypto.diffieHellman({ privateKey: ephemeral.privateKey, publicKey: clientPubKeyObj })
  );

  // ikm = HKDF(auth_secret, ecdh_secret, "WebPush: info" ‖ 0x00 ‖ clientPub ‖ ephPub)
  const ikm = Buffer.from(crypto.hkdfSync(
    'sha256', ecdhSecret, authSecret,
    Buffer.concat([WEBPUSH_INFO_PREFIX, clientPub, ephPubRaw]), 32
  ));

  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt,
    Buffer.from('Content-Encoding: aes128gcm\x00', 'utf8'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt,
    Buffer.from('Content-Encoding: nonce\x00', 'utf8'), 12));

  // Single record: plaintext ‖ 0x02 (final-record delimiter), then AEAD.
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([0x02])])),
    cipher.final(),
    cipher.getAuthTag()
  ]);

  // aes128gcm header: salt(16) ‖ record-size(4,BE) ‖ key-id-len(1) ‖ key-id
  const rsField = Buffer.alloc(4);
  rsField.writeUInt32BE(RS_RECORD_SIZE, 0);
  const header = Buffer.concat([
    salt,
    rsField,
    Buffer.of(ephPubRaw.length),
    ephPubRaw
  ]);
  const body = Buffer.concat([header, ciphertext]);

  return { body, headers: {} }; // encryption headers travel INSIDE aes128gcm body
}

/* ── High-level send ───────────────────────────────────────────────────── */

/**
 * Encrypt + deliver one notification to one subscription.
 * @returns {Promise<{ok:boolean,status:number,prune:boolean}>}
 *          prune=true ⇒ endpoint is dead (404/410) and should be deleted.
 */
export async function pushToSubscription(subscription, payloadObj, opts) {
  const { ttlSeconds = 24 * 3600, urgency = 'normal', vapidKeys, vapidSubject } = opts;
  const endpoint = String(subscription.endpoint || '');
  if (!/^https:\/\/[^\s]+$/.test(endpoint)) {
    return { ok: false, status: 400, prune: false, error: 'invalid endpoint' };
  }

  let body, authHeader;
  try {
    ({ body } = encryptPayload(
      { p256dh: subscription.p256dh_key, auth: subscription.auth_key },
      JSON.stringify(payloadObj)
    ));
    authHeader = vapidAuthorizationHeader(endpoint, vapidKeys, vapidSubject);
  } catch (err) {
    return { ok: false, status: 0, prune: false, error: err.message };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        TTL: String(Math.max(0, Math.min(ttlSeconds, 2419200))),
        Urgency: urgency === 'high' ? 'high' : 'normal',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Authorization: authHeader
      },
      body
    });
    const ok = res.status === 200 || res.status === 201;
    return { ok, status: res.status, prune: res.status === 404 || res.status === 410 };
  } catch (err) {
    return { ok: false, status: 0, prune: false, error: err.message };
  }
}

/** Exported for tests + key-gen script. */
export const __internals = { b64u, b64uDec, rawPublic, jwkFromRawPoint, derToRawSignature };
