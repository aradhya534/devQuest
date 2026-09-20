// HMAC request signing for the dashboard. The server verifies the signature over this exact message (see
// Challenge 01): METHOD (upper case), path, the SHA-256 hex digest of the raw body, the timestamp and the
// nonce, joined with newlines, then HMAC-SHA256 with the shared secret, hex encoded.

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {string} secret
 * @param {Crypto} [cryptoImpl]  Web Crypto; injected so it can be tested outside a browser.
 * @returns {(input: { method: string, path: string, rawBody?: string, timestamp: number | string, nonce: string }) => Promise<string>}
 */
export function createHmacSigner(secret, cryptoImpl = globalThis.crypto) {
  const encoder = new TextEncoder();
  return async function sign({ method, path, rawBody, timestamp, nonce }) {
    const bodyDigest = toHex(await cryptoImpl.subtle.digest("SHA-256", encoder.encode(rawBody ?? "")));
    const message = [method.toUpperCase(), path, bodyDigest, String(timestamp), nonce].join("|");
    const key = await cryptoImpl.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return toHex(await cryptoImpl.subtle.sign("HMAC", key, encoder.encode(message)));
  };
}
