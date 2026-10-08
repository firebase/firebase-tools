import { createHmac, randomBytes } from "crypto";
import { MfaEnrollment } from "./types";

// Second factor ID, as in the sign_in_second_factor claim and the client SDKs.
export const TOTP_FACTOR_ID = "totp";

// TOTP parameters returned to clients when they start a TOTP enrollment. These
// are the defaults that authenticator apps expect.
export const TOTP_CODE_LENGTH = 6;
export const TOTP_PERIOD_SEC = 30;
export const TOTP_HASHING_ALGORITHM = "SHA1";

// RFC 4648 base32 alphabet, which is what authenticator apps expect.
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Generate a random TOTP shared secret.
 * @return a 160 bit secret encoded as 32 base32 characters (no padding)
 */
export function generateTotpSecret(): string {
  // Each random byte picks one of the 32 characters; 256 is a multiple of 32.
  return Array.from(randomBytes(32), (byte) => BASE32_ALPHABET[byte & 31]).join("");
}

/**
 * Decode a base32 string (RFC 4648), ignoring case and trailing padding.
 * @param encoded the base32 string
 * @return the decoded bytes
 */
export function base32Decode(encoded: string): Buffer {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of encoded.toUpperCase().replace(/=+$/, "")) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value < 0) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    buffer = ((buffer << 5) | value) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generate the TOTP code (RFC 6238, HMAC-SHA1) for a secret at a given time.
 * @param secret the base32 encoded shared secret
 * @param timeMs the time in milliseconds since epoch, defaults to now
 * @return the code as a zero padded string of TOTP_CODE_LENGTH digits
 */
export function generateTotpCode(secret: string, timeMs: number = Date.now()): string {
  const counter = Math.floor(timeMs / 1000 / TOTP_PERIOD_SEC);
  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  message.writeUInt32BE(counter % 0x100000000, 4);
  const hmac = createHmac("sha1", base32Decode(secret)).update(message).digest();
  // Dynamic truncation, RFC 4226 section 5.3.
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return (binary % 10 ** TOTP_CODE_LENGTH).toString().padStart(TOTP_CODE_LENGTH, "0");
}

/**
 * Check a TOTP code against a secret, accepting codes from adjacent intervals
 * to tolerate clock skew between the client and the emulator.
 * @param secret the base32 encoded shared secret
 * @param code the code entered by the user
 * @param adjacentIntervals how many intervals before and after now to accept
 * @return true if the code is valid now or within the adjacent intervals
 */
export function verifyTotpCode(secret: string, code: string, adjacentIntervals: number): boolean {
  const now = Date.now();
  for (let i = -adjacentIntervals; i <= adjacentIntervals; i++) {
    const timeMs = now + i * TOTP_PERIOD_SEC * 1000;
    // Skip intervals before the epoch, e.g. when tests fake the clock at 0.
    if (timeMs >= 0 && generateTotpCode(secret, timeMs) === code) {
      return true;
    }
  }
  return false;
}

/**
 * Remove the emulator only TOTP shared secrets from MFA enrollments, for
 * anything sent to clients. Admin endpoints keep them so that export works.
 * @param mfaInfo the MFA enrollments of a user
 * @return copies of the enrollments without the TOTP shared secrets
 */
export function redactTotpSecrets(
  mfaInfo: MfaEnrollment[] | undefined,
): MfaEnrollment[] | undefined {
  return mfaInfo?.map((enrollment) => ({ ...enrollment, emulatorTotpSecret: undefined }));
}
