import { type BinaryLike, createHash } from 'node:crypto';
import type { Socket } from 'node:net';
import type { BufferReader } from '../buffer-reader.js';
import type { BufferWriter } from '../buffer-writer.js';
import type { ConnectionState } from '../connection.types';
import { BackendMessageCode } from '../message-codes';
import { BaseAuthFlow } from './base-auth-flow';

export type Md5AuthOptions = {
  method: 'md5';
  validateCredentials?: (
    credentials: {
      username: string;
      preHashedPassword: string;
      salt: Buffer;
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
  private salt: Buffer;
  private completed = false;

  constructor(params: {
    auth: Md5AuthOptions;
    username: string;
    socket: Socket;
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
          const expectedHashedPassword = await hashPreHashedPassword(
            preHashedPassword,
            salt,
          );
          return hashedPassword === expectedHashedPassword;
        }),
    };
    this.username = params.username;
    this.salt = generateMd5Salt();
  }

  async handleClientMessage(message: Buffer): Promise<void> {
    const length = this.reader.int32();
    const hashedPassword = this.reader.cstring();

    this.socket.pause();
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
    this.socket.resume();

    if (!isValid) {
      this.sendError({
        severity: 'FATAL',
        code: '28P01',
        message: `password authentication failed for user "${this.username}"`,
      });
      this.socket.end();
      return;
    }

    this.completed = true;
  }

  override sendInitialAuthMessage(): void {
    this.sendAuthenticationMD5Password();
  }

  get isCompleted(): boolean {
    return this.completed;
  }

  /**
   * Sends the authentication response to the client.
   *
   * @see https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-START-UP
   */
  private sendAuthenticationMD5Password(): void {
    this.writer.addInt32(5);
    this.writer.add(Buffer.from(this.salt));

    const response = this.writer.flush(
      BackendMessageCode.AuthenticationResponse,
    );

    this.socket.write(response);
  }
}

/**
 * Hashes a password using Postgres' nested MD5 algorithm.
 *
 * @see https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-START-UP
 */
export async function hashPreHashedPassword(
  preHashedPassword: string,
  salt: Buffer,
) {
  const hash = md5(Buffer.concat([Buffer.from(preHashedPassword), salt]));
  return `md5${hash}`;
}

/**
 * Computes the MD5 hash of the given value.
 */
export function md5(value: BinaryLike) {
  return createHash('md5').update(value).digest('hex');
}

/**
 * Generates a random 4-byte salt for MD5 hashing.
 */
export function generateMd5Salt() {
  const salt = Buffer.alloc(4);
  crypto.getRandomValues(salt);
  return salt;
}

export function createPreHashedPassword(username: string, password: string) {
  return md5(`${password}${username}`);
}
