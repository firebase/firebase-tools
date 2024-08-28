import {
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { Socket } from 'node:net';
import type { BufferReader } from '../../buffer-reader.js';
import type { BufferWriter } from '../../buffer-writer.js';
import type { ConnectionState } from '../../connection.types';
import type { AuthFlow } from '../base-auth-flow';
import { SaslMechanism } from './sasl-mechanism';

export type ScramSha256Data = {
  salt: string;
  iterations: number;
  storedKey: string;
  serverKey: string;
};

export type ScramSha256AuthOptions = {
  method: 'scram-sha-256';
  validateCredentials?: (
    params: {
      authMessage: string;
      clientProof: string;
      username: string;
      scramSha256Data: ScramSha256Data;
    },
    connectionState: ConnectionState,
  ) => boolean | Promise<boolean>;
  getScramSha256Data: (
    params: {
      username: string;
    },
    connectionState: ConnectionState,
  ) => ScramSha256Data | Promise<ScramSha256Data>;
};

/**
 * Creates scram-sha-256 data for password authentication.
 * @see https://www.postgresql.org/docs/current/sasl-authentication.html
 */
export function createScramSha256Data(
  password: string,
  iterations = 4096,
): ScramSha256Data {
  const salt = randomBytes(16).toString('base64');
  const saltBuffer = Buffer.from(salt, 'base64');
  const saltedPassword = pbkdf2Sync(
    password,
    saltBuffer,
    iterations,
    32,
    'sha256',
  );

  const clientKey = createHmac('sha256', saltedPassword)
    .update('Client Key')
    .digest();
  const storedKey = createHash('sha256').update(clientKey).digest();

  const serverKey = createHmac('sha256', saltedPassword)
    .update('Server Key')
    .digest();

  return {
    salt,
    iterations,
    storedKey: storedKey.toString('base64'),
    serverKey: serverKey.toString('base64'),
  };
}

/**
 * Verifies a scram-sha-256 password using the provided parameters.
 * @see https://www.postgresql.org/docs/current/sasl-authentication.html
 */
export function verifyScramSha256Password(params: {
  authMessage: string;
  clientProof: string;
  storedKey: string;
}) {
  const { authMessage, clientProof, storedKey } = params;
  const clientProofBuffer = Buffer.from(clientProof, 'base64');
  const storedKeyBuffer = Buffer.from(storedKey, 'base64');

  const clientSignature = createHmac('sha256', storedKeyBuffer)
    .update(authMessage)
    .digest();
  const clientKey = Buffer.alloc(clientProofBuffer.length);
  for (let i = 0; i < clientProofBuffer.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    clientKey[i] = clientProofBuffer[i]! ^ clientSignature[i]!;
  }

  const computedStoredKey = createHash('sha256').update(clientKey).digest();

  return timingSafeEqual(storedKeyBuffer, computedStoredKey);
}

const ScramSha256Step = {
  Initial: 'Initial',
  ServerFirstMessage: 'ServerFirstMessage',
  ServerFinalMessage: 'ServerFinalMessage',
  Completed: 'Completed',
} as const;

type ScramSha256Step = (typeof ScramSha256Step)[keyof typeof ScramSha256Step];

export class ScramSha256AuthFlow extends SaslMechanism implements AuthFlow {
  auth: ScramSha256AuthOptions & {
    validateCredentials: NonNullable<
      ScramSha256AuthOptions['validateCredentials']
    >;
  };
  username: string;
  clientFirstMessageBare?: string;
  serverFirstMessage?: string;
  serverNonce?: string;
  step: ScramSha256Step = ScramSha256Step.Initial;
  reader: BufferReader;
  scramSha256Data?: ScramSha256Data;
  connectionState: ConnectionState;

  constructor(params: {
    auth: ScramSha256AuthOptions;
    username: string;
    socket: Socket;
    reader: BufferReader;
    writer: BufferWriter;
    connectionState: ConnectionState;
  }) {
    super({
      socket: params.socket,
      writer: params.writer,
    });
    this.username = params.username;
    this.auth = {
      ...params.auth,
      validateCredentials:
        params.auth.validateCredentials ??
        (async ({ authMessage, clientProof, scramSha256Data }) => {
          return verifyScramSha256Password({
            authMessage,
            clientProof,
            storedKey: scramSha256Data.storedKey,
          });
        }),
    };
    this.reader = params.reader;
    this.connectionState = params.connectionState;
  }

  /**
   * Get the scram-sha-256 data for the username.
   * This function is cached to always return the same data as we are generating random values in createScramSha256Data.
   */
  async getScramSha256Data(params: { username: string }) {
    if (!this.scramSha256Data) {
      this.socket.pause();
      this.scramSha256Data = await this.auth.getScramSha256Data(
        params,
        this.connectionState,
      );
      this.socket.resume();
    }
    return this.scramSha256Data;
  }

  sendInitialAuthMessage() {
    this.sendAuthenticationSASL();
  }

  async handleClientMessage(message: Buffer) {
    switch (this.step) {
      case ScramSha256Step.Initial:
        return await this.handleClientFirstMessage(message);
      case ScramSha256Step.ServerFirstMessage:
        return await this.handleClientFinalMessage(message);
      default:
        throw new Error('Unexpected SCRAM-SHA-256 authentication step');
    }
  }

  async handleClientFirstMessage(message: Buffer) {
    const length = this.reader.int32();
    const saslMechanism = this.reader.cstring();

    if (saslMechanism !== 'SCRAM-SHA-256') {
      this.sendError({
        severity: 'FATAL',
        code: '28000',
        message: 'Unsupported SASL authentication mechanism',
      });
      this.socket.end();
      return;
    }

    const responseLength = this.reader.int32();
    const clientFirstMessage = this.reader.string(responseLength);

    const serverFirstMessage =
      await this.createServerFirstMessage(clientFirstMessage);

    this.step = ScramSha256Step.ServerFirstMessage;
    this.sendAuthenticationSASLContinue(serverFirstMessage);
  }

  async createServerFirstMessage(clientFirstMessage: string) {
    const clientFirstMessageParts = clientFirstMessage.split(',');
    this.clientFirstMessageBare = clientFirstMessageParts.slice(2).join(',');
    const clientNonce =
      clientFirstMessageParts
        .find((part) => part.startsWith('r='))
        ?.substring(2) || '';

    // Generate server nonce by appending random bytes to client nonce
    const serverNoncePart = randomBytes(18).toString('base64');
    this.serverNonce = clientNonce + serverNoncePart;

    const { salt, iterations } = await this.getScramSha256Data({
      username: this.username,
    });
    this.serverFirstMessage = `r=${this.serverNonce},s=${salt},i=${iterations}`;

    return this.serverFirstMessage;
  }

  async handleClientFinalMessage(message: Buffer) {
    try {
      const serverFinalMessage = await this.createServerFinalMessage(message);
      this.step = ScramSha256Step.Completed;
      this.sendAuthenticationSASLFinal(serverFinalMessage);
    } catch (error) {
      this.sendError({
        severity: 'FATAL',
        code: '28000',
        message: (error as Error).message,
      });
      this.socket.end();
    }
  }

  get isCompleted() {
    return this.step === ScramSha256Step.Completed;
  }

  async createServerFinalMessage(message: Buffer) {
    const length = this.reader.int32();
    const clientFinalMessage = this.reader.string(length);
    const clientFinalMessageParts = clientFinalMessage.split(',');
    const channelBinding = clientFinalMessageParts
      .find((part) => part.startsWith('c='))
      ?.substring(2);
    const fullNonce = clientFinalMessageParts
      .find((part) => part.startsWith('r='))
      ?.substring(2);
    const clientProof = clientFinalMessageParts
      .find((part) => part.startsWith('p='))
      ?.substring(2);

    if (!channelBinding || !fullNonce || !clientProof) {
      throw new Error('Invalid client final message');
    }

    // Verify that the nonce matches what we expect
    if (fullNonce !== this.serverNonce) {
      throw new Error('Nonce mismatch');
    }

    // Reconstruct the client-final-message-without-proof
    const clientFinalMessageWithoutProof = `c=${channelBinding},r=${fullNonce}`;

    // Construct the full authMessage
    const authMessage = `${this.clientFirstMessageBare},${this.serverFirstMessage},${clientFinalMessageWithoutProof}`;

    const data = await this.getScramSha256Data({
      username: this.username,
    });

    this.socket.pause();
    const isValid = await this.auth.validateCredentials(
      {
        authMessage,
        clientProof,
        username: this.username,
        scramSha256Data: data,
      },
      this.connectionState,
    );
    this.socket.resume();

    if (!isValid) {
      throw new Error(
        `password authentication failed for user "${this.username}"`,
      );
    }

    const serverSignature = createHmac(
      'sha256',
      Buffer.from(data.serverKey, 'base64'),
    )
      .update(authMessage)
      .digest();

    return `v=${serverSignature.toString('base64')}`;
  }
}
