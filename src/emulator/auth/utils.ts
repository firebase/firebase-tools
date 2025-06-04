import { URL } from "url";
import * as express from "express";
import { EmulatorRegistry } from "../registry";
import { Emulators } from "../types";
import { EmulatorLogger } from "../emulatorLogger";

/**
 * Utility type to take all fields from T but mark some of them (K) as required.
 */
export type MakeRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Utility type to make all fields recursively optional.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Checks if email looks like a valid email address.
 *
 * The testing only checks if the email has two parts joined by an "@" symbol.
 * This means some strings may pass in the Auth Emulator but fail in production.
 * This is an intentional tradeoff, since the Auth Emulator is primarily used
 * for testing with SDKs using fake (made up) email addresses as input.
 *
 * @param email the string to test
 * @return whether or not the string looks like an email address
 */
export function isValidEmailAddress(email: string): boolean {
  // Copied from https://github.com/firebase/firebase-js-sdk/blob/ec2e8a01543db9581a7fcf646976f6c550294d68/packages/auth/src/utils.js#L476
  // We have considered importing an npm module for fully compliant RFC 822
  // validation, but decided it is not worth the effort and bloat.
  // We have also considered using more sophisticated RegExps but decided not
  // to because those produce a lot of false negatives. (The regex below allows
  // (almost) everything allowed in production, which is more desirable. False
  // _positives_ are acceptable, given we're in a testing environment.)
  // Further reading: https://jackfoxy.github.io/FsRegEx/emailregex.html
  return /^[^@]+@[^@]+$/.test(email);
}

/**
 * Checks if string looks like a valid phone number.
 *
 * The testing only checks if it begins with a plus ("+") symbol.
 * This means MANY strings may pass in the Auth Emulator but fail in production.
 * This is an intentional tradeoff, since the Auth Emulator is primarily used
 * for testing with SDKs using fake (made up) phone numbers as input. The main
 * point of the check is to disallow local (non-international) formats.
 *
 * @param phoneNumber the string to test
 * @return whether or not the string looks like a phone number
 */
export function isValidPhoneNumber(phoneNumber: string): boolean {
  // We have considered importing an npm module like google-libphonenumber (used
  // in production Firebase Console for client-side validation), but decided it
  // is not worth the effort and bloat (500+ kB). libphonenumber-js is not used
  // either since it has different behaviors and may block numbers that are
  // valid in production.
  return /^\+/.test(phoneNumber);
}

/**
 * Canonicalize email address by converting it to all lowercase.
 *
 * @param email the email to canonicalize
 * @return the same email address by in all lowercase
 */
export function canonicalizeEmailAddress(email: string): string {
  return email.toLowerCase();
}

/**
 * Checks if uri looks like a valid URL and return parsed result.
 *
 * Note: There is no guarantee that this function will match production Firebase
 * Authentication behavior for all inputs. It should be close enough though.
 *
 * @param uri the string to test
 * @return the parsed URL, or undefined if failed.
 */
export function parseAbsoluteUri(uri: string): URL | undefined {
  try {
    // Note: Without a second "base" param, this will NOT accept relative URLs
    // like "/foo". That is the intended behavior.
    return new URL(uri);
  } catch {
    return undefined;
  }
}

/**
 * Generate a random identifier that consists of only [A-Za-z0-9].
 *
 * This is intentionally NOT SECURE and should not be used for crypto, since it
 * does not have enough entropy.
 *
 * @param len the length of the string
 * @return the generated identifier
 */
export function randomId(len: number): string {
  // Alphanumeric characters
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let autoId = "";
  for (let i = 0; i < len; i++) {
    autoId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return autoId;
}
/**
 * Generate a random string using base64url alphabet (only [A-Za-z0-9_-]).
 *
 * This is intentionally NOT SECURE and should not be used for crypto, since it
 * does not have enough entropy. The decoded bytes has no meanings or format.
 *
 * @param len the length of the generated string
 * @return the generated string with only base64url characters and NO paddings
 */
export function randomBase64UrlStr(len: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  let autoId = "";
  for (let i = 0; i < len; i++) {
    autoId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return autoId;
}

/**
 * Generate a random string with digits only ([0-9]).
 *
 * This is intentionally NOT SECURE and should not be used for crypto, since it
 * does not have enough entropy. The result may have leading zeros.
 *
 * @param len the length of the generated string (i.e. number of digits)
 * @return the generated string with only 0-9 characters
 */
export function randomDigits(len: number): string {
  let digits = "";
  for (let i = 0; i < len; i++) {
    digits += Math.floor(Math.random() * 10);
  }
  return digits;
}

/**
 * Get the unix timestamp (i.e. seconds since unix epoch).
 *
 * @param date the date to be converted
 * @return number of seconds since unix epoch of the input
 */
export function toUnixTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Log an internal error. The log is visible both in tests and in emulator logs.
 * @param err the error to be logged
 */
export function logError(err: Error): void {
  if (!EmulatorRegistry.isRunning(Emulators.AUTH)) {
    // If this server is running but not registered, we must be in tests and
    // the logging below will be suppressed. Let's print the error directly.
    console.error(err);
  }
  EmulatorLogger.forEmulator(Emulators.AUTH).log(
    "WARN",
    err.stack || err.message || err.constructor.name,
  );
}

/**
 * Return a URL object with Auth Emulator protocol, host, and port populated.
 *
 * Compared to EmulatorRegistry.url, this functions prefers the configured host
 * and port, which are likely more useful when the link is opened on the same
 * device running the emulator (assuming developers click on the link printed on
 * terminal or Emulator UI).
 */
export function authEmulatorUrl(req: express.Request): URL {
  if (EmulatorRegistry.isRunning(Emulators.AUTH)) {
    return EmulatorRegistry.url(Emulators.AUTH);
  } else {
    return EmulatorRegistry.url(Emulators.AUTH, req);
  }
}

/**
 * Mirror one field to dest from source. With strong TypeScript typing.
 * @param dest the object to receive the field
 * @param field the field name to copy (i.e. a string)
 * @param source the object where field value is read from
 */
export function mirrorFieldTo<D, K extends keyof D>(
  dest: D,
  field: K,
  source: { [KK in K]?: D[KK] },
): void {
  const value = source[field] as D[K] | undefined;
  if (value === undefined) {
    delete dest[field];
  } else {
    dest[field] = value;
  }
}
