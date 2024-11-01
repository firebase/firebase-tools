import { createBackendErrorMessage } from '../backend-error';
import type { BufferReader } from '../buffer-reader';
import type { BufferWriter } from '../buffer-writer';
import { closeSignal } from '../connection';
import type { ConnectionState } from '../connection.types';
import { BackendMessageCode } from '../message-codes';
import { BaseAuthFlow } from './base-auth-flow';


type BufferSource = ArrayBufferView | ArrayBuffer;

export type Md5AuthOptions = {
  method: 'md5';
  validateCredentials?: (
    credentials: {
      username: string;
      preHashedPassword: string;
      salt: BufferSource;
      hashedPassword: string;
    },
    connectionState: ConnectionState,
  ) => boolean | Promise<boolean>;
  getPreHashedPassword: (
    credentials: { username: string },
    connectionState: ConnectionState,
  ) => string | Promise<string>;
};

export class Md5AuthFlow extends BaseAuthFlow {
  private auth: Md5AuthOptions & {
    validateCredentials: NonNullable<Md5AuthOptions['validateCredentials']>;
  };
  private username: string;
  private salt: Uint8Array;
  private completed = false;

  constructor(params: {
    auth: Md5AuthOptions;
    username: string;
    reader: BufferReader;
    writer: BufferWriter;
    connectionState: ConnectionState;
  }) {
    super(params);
    this.auth = {
      ...params.auth,
      validateCredentials:
        params.auth.validateCredentials ??
        (async ({ preHashedPassword, hashedPassword, salt }) => {
          const expectedHashedPassword = await hashPreHashedPassword(preHashedPassword, salt);
          return hashedPassword === expectedHashedPassword;
        }),
    };
    this.username = params.username;
    this.salt = generateMd5Salt();
  }

  async *handleClientMessage(message: BufferSource) {
    const length = this.reader.int32();
    const hashedPassword = this.reader.cstring();

    const preHashedPassword = await this.auth.getPreHashedPassword(
      {
        username: this.username,
      },
      this.connectionState,
    );
    const isValid = await this.auth.validateCredentials(
      {
        username: this.username,
        hashedPassword,
        preHashedPassword,
        salt: this.salt,
      },
      this.connectionState,
    );

    if (!isValid) {
      yield createBackendErrorMessage({
        severity: 'FATAL',
        code: '28P01',
        message: `password authentication failed for user "${this.username}"`,
      });
      yield closeSignal;
      return;
    }

    this.completed = true;
  }

  override createInitialAuthMessage() {
    return this.createAuthenticationMD5Password();
  }

  get isCompleted(): boolean {
    return this.completed;
  }

  /**
   * Creates the authentication response.
   *
   * @see https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-START-UP
   */
  private createAuthenticationMD5Password() {
    this.writer.addInt32(5);
    this.writer.add(Buffer.from(this.salt));

    return this.writer.flush(BackendMessageCode.AuthenticationResponse);
  }
}

/**
 * Hashes a password using Postgres' nested MD5 algorithm.
 *
 * @see https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-START-UP
 */
export async function hashPreHashedPassword(preHashedPassword: string, salt: BufferSource) {
  const hash = await md5(
    concat([
      new TextEncoder().encode(preHashedPassword),
      salt instanceof ArrayBuffer
        ? new Uint8Array(salt)
        : new Uint8Array(salt.buffer, salt.byteOffset, salt.byteLength),
    ]),
  );
  return `md5${hash}`;
}

/**
 * Computes the MD5 hash of the given value.
 */
export async function md5(value: string | BufferSource) {
  const hash = await crypto.subtle.digest(
    'MD5',
    typeof value === 'string' ? new TextEncoder().encode(value) : value,
  );

  return encodeHex(hash);
}

/**
 * Generates a random 4-byte salt for MD5 hashing.
 */
export function generateMd5Salt() {
  const salt = new Uint8Array(4);
  crypto.getRandomValues(salt);
  return salt;
}

export async function createPreHashedPassword(username: string, password: string) {
  return await md5(`${password}${username}`);
}

export function concat(buffers: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const buffer of buffers) {
    length += buffer.length;
  }
  const output = new Uint8Array(length);
  let index = 0;
  for (const buffer of buffers) {
    output.set(buffer, index);
    index += buffer.length;
  }

  return output;
}

const hexTable = new TextEncoder().encode("0123456789abcdef");
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeHex(src: string | Uint8Array | ArrayBuffer): string {
  const u8 = validateBinaryLike(src);

  const dst = new Uint8Array(u8.length * 2);
  for (let i = 0; i < u8.length; i++) {
    const v = u8[i]!;
    dst[i * 2] = hexTable[v >> 4]!;
    dst[i * 2 + 1] = hexTable[v & 0x0f]!;
  }
  return textDecoder.decode(dst);
}


export function validateBinaryLike(source: unknown): Uint8Array {
  if (typeof source === "string") {
    return textEncoder.encode(source);
  } else if (source instanceof Uint8Array) {
    return source;
  } else if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  throw new TypeError(
    `Cannot validate the input as it must be a Uint8Array, a string, or an ArrayBuffer`,
  );
}
