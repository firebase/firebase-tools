/**
 * Derives a cryptographic key from a password using the PBKDF2 algorithm.
 *
 * This function uses Web Crypto's `SubtleCrypto` API to derive a key from
 * a given password, salt, iteration count, and hash algorithm. The derived
 * key is returned as raw bits (an `ArrayBuffer`) and can be used in subsequent
 * cryptographic operations.
 *
 * PBKDF2 (Password-Based Key Derivation Function 2) is a widely used key
 * derivation function that applies a selected HMAC digest algorithm (e.g., SHA-256)
 * to derive a key of the requested length.
 */
export async function pbkdf2(
  password: string,
  salt: ArrayBuffer,
  iterations: number,
  length: number,
  hashAlgorithm: 'SHA-256' | 'SHA-384' | 'SHA-512',
) {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: iterations,
      hash: hashAlgorithm, // use the specified hash algorithm
    },
    keyMaterial,
    length * 8, // length in bits (e.g., 32 bytes * 8 = 256 bits)
  );

  return derivedBits;
}

/**
 * Creates an HMAC key and generates a message authentication code (MAC)
 * for the given message using the specified hash algorithm.
 *
 * This function first imports the provided key as a `CryptoKey` using
 * the HMAC algorithm and specified hash function. It then generates an
 * HMAC for the given message. The HMAC is returned as an `ArrayBuffer`.
 *
 * HMAC (Hash-based Message Authentication Code) is a mechanism that uses
 * a cryptographic hash function along with a secret key to ensure data integrity
 * and authenticity.
 */
export async function createHmacKey(
  key: ArrayBuffer,
  message: string,
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512',
) {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    key,
    {
      name: 'HMAC',
      hash: { name: algorithm },
    },
    false,
    ['sign'],
  );

  const hmacKey = await crypto.subtle.sign('HMAC', keyMaterial, encoder.encode(message));

  return hmacKey;
}

/**
 * Computes a cryptographic hash of the given key using the specified hash algorithm.
 *
 * This function utilizes Web Crypto's `SubtleCrypto.digest` method to compute
 * a hash of the provided key material. The resulting hash is returned as an
 * `ArrayBuffer`. This can be used to create a hashed version of a key or any
 * other binary data.
 */
export async function createHashKey(
  key: ArrayBuffer,
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512',
) {
  const hashKey = await crypto.subtle.digest(
    {
      name: algorithm,
    },
    key,
  );

  return hashKey;
}

/**
 * Implements a timing-safe equal function that compares two buffers in
 * constant time.
 *
 * Web Crypto's `SubtleCrypto` API does not provide a built-in timing-safe
 * equal function, but this logic can be implemented by leveraging HMACs,
 * which inherently require constant-time comparisons for verification.
 *
 * This function generates an HMAC for the first buffer and uses Web Crypto's
 * `verify` method to perform a timing-safe comparison against the second buffer.
 *
 * @see https://github.com/w3c/webcrypto/issues/270#issuecomment-1899234835
 */
export async function timingSafeEqual(bufferA: BufferSource, bufferB: BufferSource) {
  const algorithm = { name: 'HMAC', hash: 'SHA-256' };
  const key = (await crypto.subtle.generateKey(algorithm, false, ['sign', 'verify'])) as CryptoKey;
  const hmac = await crypto.subtle.sign(algorithm, key, bufferA);
  const equal = await crypto.subtle.verify(algorithm, key, hmac, bufferB);
  return equal;
}

interface CryptoKey {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/CryptoKey/algorithm) */
  readonly algorithm: {
    name: string;
};
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/CryptoKey/extractable) */
  readonly extractable: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/CryptoKey/type) */
  readonly type: "private" | "public" | "secret";
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/CryptoKey/usages) */
  readonly usages: KeyUsage[];
}

type KeyUsage = "decrypt" | "deriveBits" | "deriveKey" | "encrypt" | "sign" | "unwrapKey" | "verify" | "wrapKey";
type BufferSource = ArrayBufferView | ArrayBuffer;