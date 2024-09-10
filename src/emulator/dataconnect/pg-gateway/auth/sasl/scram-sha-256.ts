import { createBackendErrorMessage } from '../../backend-error';
import type { BufferReader } from '../../buffer-reader';
import type { BufferWriter } from '../../buffer-writer';
import { closeSignal } from '../../connection';
import type { ConnectionState } from '../../connection.types';
import { createHashKey, createHmacKey, pbkdf2, timingSafeEqual } from '../../crypto';
import type { AuthFlow } from '../base-auth-flow';
import { SaslMechanism } from './sasl-mechanism';

type BufferSource = ArrayBufferView | ArrayBuffer;

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
export async function createScramSha256Data(
  password: string,
  iterations = 4096,
): Promise<ScramSha256Data> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const saltedPassword = await pbkdf2(password, salt, iterations, 32, 'SHA-256');
  // const saltedPassword = pbkdf2Sync(password, saltBuffer, iterations, 32, 'sha256');

  const clientKey = await createHmacKey(saltedPassword, 'Client Key', 'SHA-256');
  // const clientKey = createHmac('sha256', saltedPassword).update('Client Key').digest();

  const storedKey = await createHashKey(clientKey, 'SHA-256');
  // const storedKey = createHash('sha256').update(clientKey).digest();

  const serverKey = await createHmacKey(saltedPassword, 'Server Key', 'SHA-256');
  // const serverKey = createHmac('sha256', saltedPassword).update('Server Key').digest();

  return {
    salt: encodeBase64(salt),
    iterations,
    storedKey: encodeBase64(storedKey),
    serverKey: encodeBase64(serverKey),
  };
}

/**
 * Verifies a scram-sha-256 password using the provided parameters.
 * @see https://www.postgresql.org/docs/current/sasl-authentication.html
 */
export async function verifyScramSha256Password(params: {
  authMessage: string;
  clientProof: string;
  storedKey: string;
}) {
  const { authMessage, clientProof, storedKey } = params;
  const clientProofBuffer = decodeBase64(clientProof);
  const storedKeyBuffer = decodeBase64(storedKey);

  const clientSignature = await createHmacKey(storedKeyBuffer, authMessage, 'SHA-256');
  const clientSignatureView = new Uint8Array(clientSignature);
  const clientKey = new Uint8Array(clientProofBuffer.length);

  for (let i = 0; i < clientProofBuffer.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    clientKey[i] = clientProofBuffer[i]! ^ clientSignatureView[i]!;
  }

  const computedStoredKey = await createHashKey(clientKey, 'SHA-256');

  return await timingSafeEqual(storedKeyBuffer, computedStoredKey);
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
    validateCredentials: NonNullable<ScramSha256AuthOptions['validateCredentials']>;
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
    reader: BufferReader;
    writer: BufferWriter;
    connectionState: ConnectionState;
  }) {
    super({ writer: params.writer });
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
      this.scramSha256Data = await this.auth.getScramSha256Data(params, this.connectionState);
    }
    return this.scramSha256Data;
  }

  createInitialAuthMessage() {
    return this.createAuthenticationSASL();
  }

  async *handleClientMessage(message: BufferSource) {
    switch (this.step) {
      case ScramSha256Step.Initial:
        return yield* this.handleClientFirstMessage(message);
      case ScramSha256Step.ServerFirstMessage:
        return yield* this.handleClientFinalMessage(message);
      default:
        throw new Error('Unexpected SCRAM-SHA-256 authentication step');
    }
  }

  async *handleClientFirstMessage(message: BufferSource) {
    const length = this.reader.int32();
    const saslMechanism = this.reader.cstring();

    if (saslMechanism !== 'SCRAM-SHA-256') {
      yield createBackendErrorMessage({
        severity: 'FATAL',
        code: '28000',
        message: 'Unsupported SASL authentication mechanism',
      });
      yield closeSignal;
      return;
    }

    const responseLength = this.reader.int32();
    const clientFirstMessage = this.reader.string(responseLength);

    const serverFirstMessage = await this.createServerFirstMessage(clientFirstMessage);

    this.step = ScramSha256Step.ServerFirstMessage;
    yield this.createAuthenticationSASLContinue(serverFirstMessage);
  }

  async createServerFirstMessage(clientFirstMessage: string) {
    const clientFirstMessageParts = clientFirstMessage.split(',');
    this.clientFirstMessageBare = clientFirstMessageParts.slice(2).join(',');
    const clientNonce =
      clientFirstMessageParts.find((part) => part.startsWith('r='))?.substring(2) || '';

    // Generate server nonce by appending random bytes to client nonce
    const serverNoncePart = new Uint8Array(18);
    crypto.getRandomValues(serverNoncePart);

    this.serverNonce = clientNonce + encodeBase64(serverNoncePart);

    const { salt, iterations } = await this.getScramSha256Data({
      username: this.username,
    });
    this.serverFirstMessage = `r=${this.serverNonce},s=${salt},i=${iterations}`;

    return this.serverFirstMessage;
  }

  async *handleClientFinalMessage(message: BufferSource) {
    try {
      const serverFinalMessage = await this.createServerFinalMessage(message);
      this.step = ScramSha256Step.Completed;
      yield this.createAuthenticationSASLFinal(serverFinalMessage);
    } catch (error) {
      yield createBackendErrorMessage({
        severity: 'FATAL',
        code: '28000',
        message: (error as Error).message,
      });
      yield closeSignal;
      return;
    }
  }

  get isCompleted() {
    return this.step === ScramSha256Step.Completed;
  }

  async createServerFinalMessage(message: BufferSource) {
    const length = this.reader.int32();
    const stringLength = length - 4; // length includes header
    const clientFinalMessage = this.reader.string(stringLength);
    const clientFinalMessageParts = clientFinalMessage.split(',');
    const channelBinding = clientFinalMessageParts
      .find((part) => part.startsWith('c='))
      ?.substring(2);
    const fullNonce = clientFinalMessageParts.find((part) => part.startsWith('r='))?.substring(2);
    const clientProof = clientFinalMessageParts.find((part) => part.startsWith('p='))?.substring(2);

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

    const isValid = await this.auth.validateCredentials(
      {
        authMessage,
        clientProof,
        username: this.username,
        scramSha256Data: data,
      },
      this.connectionState,
    );

    if (!isValid) {
      throw new Error(`password authentication failed for user "${this.username}"`);
    }

    const serverKeyBuffer = decodeBase64(data.serverKey);
    const serverSignature = await createHmacKey(serverKeyBuffer, authMessage, 'SHA-256');

    return `v=${encodeBase64(serverSignature)}`;
  }
}

export function encodeBase64(data: ArrayBuffer | Uint8Array | string): string {
  // CREDIT: https://gist.github.com/enepomnyaschih/72c423f727d395eeaa09697058238727
  const uint8 = data as Uint8Array;
  let result = "";
  let i;
  const l = uint8.length;
  for (i = 2; i < l; i += 3) {
    result += base64abc[(uint8[i - 2]!) >> 2];
    result += base64abc[
      (((uint8[i - 2]!) & 0x03) << 4) |
      ((uint8[i - 1]!) >> 4)
    ];
    result += base64abc[
      (((uint8[i - 1]!) & 0x0f) << 2) |
      ((uint8[i]!) >> 6)
    ];
    result += base64abc[(uint8[i]!) & 0x3f];
  }
  if (i === l + 1) {
    // 1 octet yet to write
    result += base64abc[(uint8[i - 2]!) >> 2];
    result += base64abc[((uint8[i - 2]!) & 0x03) << 4];
    result += "==";
  }
  if (i === l) {
    // 2 octets yet to write
    result += base64abc[(uint8[i - 2]!) >> 2];
    result += base64abc[
      (((uint8[i - 2]!) & 0x03) << 4) |
      ((uint8[i - 1]!) >> 4)
    ];
    result += base64abc[((uint8[i - 1]!) & 0x0f) << 2];
    result += "=";
  }
  return result;
}

/**
 * Decodes a base64-encoded string.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc4648.html#section-4}
 *
 * @param b64 The base64-encoded string to decode.
 * @returns The decoded data.
 *
 * @example Usage
 * ```ts
 * import { decodeBase64 } from "@std/encoding/base64";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(
 *   decodeBase64("Zm9vYmFy"),
 *   new TextEncoder().encode("foobar")
 * );
 * ```
 */
export function decodeBase64(b64: string): Uint8Array {
  const binString = atob(b64);
  const size = binString.length;
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}

const base64abc = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "+",
  "/",
];