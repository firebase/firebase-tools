import type { AuthFlow } from './auth/base-auth-flow';
import { type AuthOptions, createAuthFlow } from './auth/index';
import { createBackendErrorMessage } from './backend-error';
import { BufferReader } from './buffer-reader';
import { BufferWriter } from './buffer-writer';
import {
  type ClientInfo,
  type ConnectionState,
  ServerStep,
  type TlsInfo,
} from './connection.types';
import type { DuplexStream } from './duplex';
import { AsyncIterableWithMetadata } from './utils';
import { getMessages, MessageBuffer } from './message-buffer';
import {
  BackendMessageCode,
  FrontendMessageCode,
  getBackendMessageName,
  getFrontendMessageName,
} from './message-codes';

type BufferSource = ArrayBufferView | ArrayBuffer;

import { logger } from "../../../logger"

export type TlsOptions = {
  key: ArrayBuffer;
  cert: ArrayBuffer;
  ca?: ArrayBuffer;
  passphrase?: string;
};

export type TlsOptionsCallback = (tlsInfo: TlsInfo) => TlsOptions | Promise<TlsOptions>;

export type PostgresConnectionOptions = {
  /**
   * The server version to send to the frontend.
   */
  serverVersion?: string | ((state: ConnectionState) => string | Promise<string>);

  /**
   * The authentication mode for the server.
   */
  auth?: AuthOptions;

  /**
   * TLS options for when clients send an SSLRequest.
   */
  tls?: TlsOptions | TlsOptionsCallback;

  /**
   * Implements the TLS upgrade logic for the stream.
   *
   * You probably don't want to implement this yourself -
   * instead use `fromNodeSocket()` helper.
   */
  upgradeTls?(
    duplex: DuplexStream<Uint8Array>,
    options: TlsOptions | TlsOptionsCallback,
    tlsInfo?: TlsInfo,
    requestCert?: boolean,
  ): Promise<{
    duplex: DuplexStream<Uint8Array>;
    tlsInfo: TlsInfo;
  }>;

  /**
   * Callback after the connection has been upgraded to TLS.
   *
   * Includes `state` which holds connection information gathered so far like `tlsInfo`.
   *
   * This will be called before the startup message is received from the frontend
   * (if TLS is being used) so is a good place to establish proxy connections if desired.
   */
  onTlsUpgrade?(state: ConnectionState): void | Promise<void>;

  /**
   * Callback after the initial startup message has been received from the frontend.
   *
   * Includes `state` which holds connection information gathered so far like `clientInfo`.
   *
   * This is called after the connection is upgraded to TLS (if TLS is being used)
   * but before authentication messages are sent to the frontend.
   *
   */
  onStartup?(state: ConnectionState): void | Promise<void>;

  /**
   * Callback after a successful authentication has completed.
   *
   * Includes `state` which holds connection information gathered so far.
   */
  onAuthenticated?(state: ConnectionState): void | Promise<void>;

  /**
   * Callback for every message received from the frontend.
   * Use this as an escape hatch to manually handle raw message data.
   *
   * Includes `state` which holds connection information gathered so far and
   * can be used to understand where the protocol is at in its lifecycle.
   *
   * Callback can optionally return raw `Uint8Array` response data that will
   * be sent back to the client. It can also return multiple `Uint8Array`
   * responses via an `Iterable<Uint8Array>` or `AsyncIterable<Uint8Array>`.
   * This means you can turn this hook into a generator function to
   * asynchronously stream responses back to the client.
   *
   * **Warning:** By managing the message yourself (returning data), you bypass further
   * processing by the `PostgresConnection` which means some state may not be collected
   * and hooks won't be called depending on where the protocol is at in its lifecycle.
   * If you wish to hook into messages without bypassing further processing, do not return
   * any data from this callback.
   */
  onMessage?(data: Uint8Array, state: ConnectionState): MessageResponse | Promise<MessageResponse>;

  /**
   * Callback for every frontend query message.
   * Use this to implement query handling.
   *
   * If left `undefined`, an error will be sent to the frontend
   * indicating that queries aren't implemented.
   *
   * TODO: change return signature to be more developer-friendly
   * and then translate to wire protocol.
   */
  onQuery?(query: string, state: ConnectionState): Uint8Array | Promise<Uint8Array>;
};

export type MessageResponse =
  | undefined
  | Uint8Array
  | Iterable<Uint8Array>
  | AsyncIterable<Uint8Array>;

export const closeSignal = Symbol('close');
export type CloseSignal = typeof closeSignal;
export type ConnectionSignal = CloseSignal;

export default class PostgresConnection {
  private step: ServerStep = ServerStep.AwaitingInitialMessage;
  options: PostgresConnectionOptions & {
    auth: NonNullable<PostgresConnectionOptions['auth']>;
  };
  authFlow?: AuthFlow;
  hasStarted = false;
  isAuthenticated = false;
  detached = false;
  writer = new BufferWriter();
  reader = new BufferReader();
  clientInfo?: ClientInfo;
  tlsInfo?: TlsInfo;
  messageBuffer = new MessageBuffer();

  constructor(
    public duplex: DuplexStream<Uint8Array>,
    options: PostgresConnectionOptions = {},
  ) {
    this.options = {
      auth: { method: 'trust' },
      ...options,
    };
    if (this.options.tls && !this.options.upgradeTls) {
      throw new Error(
        'TLS options are only available when upgradeTls() is implemented. Did you mean to use fromNodeSocket()?',
      );
    }

    this.processData();
  }

  get state(): ConnectionState {
    return {
      hasStarted: this.hasStarted,
      isAuthenticated: this.isAuthenticated,
      clientInfo: this.clientInfo,
      tlsInfo: this.tlsInfo,
      step: this.step,
    };
  }

  /**
   * Detaches the `PostgresConnection` from the stream.
   * After calling this, data will no longer be buffered
   * and all processing will halt.
   */
  async detach() {
    this.detached = true;
    return this.duplex;
  }

  async processData() {
    const writer = this.duplex.writable.getWriter();
    for await (const data of this.duplex.readable as any) {
      this.messageBuffer.mergeBuffer(data);

      for await (const clientMessage of this.messageBuffer.processMessages(this.hasStarted)) {
        logger.debug('Frontend message', getFrontendMessageName(clientMessage[0]!));
        for await (const responseMessage of this.handleClientMessage(clientMessage)) {
          if (responseMessage === closeSignal) {
            await writer.close();
            return;
          }
          for await (const msg of getMessages(responseMessage)) {
            if (msg[0] !== BackendMessageCode.NoticeMessage) {
              logger.debug('Backend message', getBackendMessageName(msg[0]!));
              if (msg[0] === BackendMessageCode.ErrorMessage) {
                logger.debug(new TextDecoder().decode(msg));
              }
            }
          }
          await writer.write(responseMessage);
        }
      }
      // TODO: anywhere else we need to check for this?
      if (this.detached) {
        return;
      }
    }
  }

  async *handleClientMessage(
    message: Uint8Array,
  ): AsyncGenerator<Uint8Array | CloseSignal, void, undefined> {
    this.reader.setBuffer(message);

    const messageResponse = await this.options.onMessage?.(message, this.state);

    // Returning any value indicates no further processing
    let skipProcessing = messageResponse !== undefined;

    // A `Uint8Array` or `Iterator<Uint8Array>` or `AsyncIterator<Uint8Array>`
    // can be returned that contains raw message response data
    if (messageResponse) {
      const iterableResponse = new AsyncIterableWithMetadata(
        messageResponse instanceof Uint8Array ? [messageResponse] : messageResponse,
      );

      // Forward yielded responses back to client
      yield* iterableResponse;

      // Yield any `Uint8Array` values returned from the iterator
      if (iterableResponse.returnValue instanceof Uint8Array) {
        yield iterableResponse.returnValue;
      }

      // Yielding or returning any value within the iterator indicates no further processing
      skipProcessing =
        iterableResponse.iterations > 0 || iterableResponse.returnValue !== undefined;
    }

    // the socket was detached during onMessage, we skip further processing
    if (this.detached) {
      return;
    }

    if (skipProcessing) {
      if (this.isStartupMessage(message)) {
        this.hasStarted = true;
      }
      return;
    }

    switch (this.step) {
      case ServerStep.AwaitingInitialMessage:
        if (this.isSslRequest(message)) {
          yield* this.handleSslRequest();
        } else if (this.isStartupMessage(message)) {
          // Guard against SSL connection not being established when `tls` is enabled
          if (this.options.tls && !this.tlsInfo) {
            yield createBackendErrorMessage({
              severity: 'FATAL',
              code: '08P01',
              message: 'SSL connection is required',
            });
            yield closeSignal;
            return;
          }
          // the next step is determined by handleStartupMessage
          yield* this.handleStartupMessage(message);
        } else {
          throw new Error('Unexpected initial message');
        }
        break;

      case ServerStep.PerformingAuthentication: {
        const authenticationComplete = yield* this.handleAuthenticationMessage(message);
        if (authenticationComplete) {
          yield* this.completeAuthentication();
        }
        break;
      }

      case ServerStep.ReadyForQuery:
        yield* this.handleRegularMessage(message);
        break;

      default:
        throw new Error(`Unexpected step: ${this.step}`);
    }
  }

  async *handleSslRequest() {
    if (!this.options.tls || !this.options.upgradeTls) {
      this.writer.addString('N');
      yield this.writer.flush();
      return;
    }

    // Otherwise respond with 'S' to indicate it is supported
    this.writer.addString('S');
    yield this.writer.flush();

    // From now on the frontend will communicate via TLS, so upgrade the connection
    const requestCert = this.options.auth.method === 'cert';

    const { duplex, tlsInfo } = await this.options.upgradeTls(
      this.duplex,
      this.options.tls,
      this.tlsInfo,
      requestCert,
    );

    this.duplex = duplex;
    this.tlsInfo = tlsInfo;

    await this.options.onTlsUpgrade?.(this.state);
  }

  async *handleStartupMessage(message: BufferSource) {
    const { majorVersion, minorVersion, parameters } = this.readStartupMessage();

    // user is required
    if (!parameters.user) {
      yield createBackendErrorMessage({
        severity: 'FATAL',
        code: '08000',
        message: 'user is required',
      });
      yield closeSignal;
      return;
    }

    if (majorVersion !== 3 || minorVersion !== 0) {
      yield createBackendErrorMessage({
        severity: 'FATAL',
        code: '08000',
        message: `Unsupported protocol version ${majorVersion.toString()}.${minorVersion.toString()}`,
      });
      yield closeSignal;
      return;
    }

    this.clientInfo = {
      majorVersion,
      minorVersion,
      parameters: {
        user: parameters.user,
        ...parameters,
      },
    };

    this.hasStarted = true;

    await this.options.onStartup?.(this.state);
    // the socket was detached during onStartup, we skip further processing
    if (this.detached) {
      return;
    }

    if (this.options.auth.method === 'trust') {
      yield* this.completeAuthentication();
      return;
    }

    this.authFlow = createAuthFlow({
      reader: this.reader,
      writer: this.writer,
      username: this.clientInfo.parameters.user,
      auth: this.options.auth,
      connectionState: this.state,
    });

    this.step = ServerStep.PerformingAuthentication;
    const initialAuthMessage = this.authFlow.createInitialAuthMessage();

    if (initialAuthMessage) {
      yield initialAuthMessage;
    }

    // 'cert' auth flow is an edge case
    // it doesn't expect a new message from the client so we can directly proceed
    if (this.options.auth.method === 'cert') {
      yield* this.authFlow.handleClientMessage(message);
      if (this.authFlow.isCompleted) {
        yield* this.completeAuthentication();
      }
    }
  }

  async *handleAuthenticationMessage(message: BufferSource) {
    const code = this.reader.byte();

    if (code !== FrontendMessageCode.Password) {
      throw new Error(`Unexpected authentication message code: ${code}`);
    }

    if (!this.authFlow) {
      throw new Error('AuthFlow not initialized');
    }

    yield* this.authFlow.handleClientMessage(message);

    return this.authFlow.isCompleted;
  }

  private async *handleRegularMessage(message: BufferSource) {
    const code = this.reader.byte();

    switch (code) {
      case FrontendMessageCode.Terminate:
        yield closeSignal;
        return;
      default:
        yield createBackendErrorMessage({
          severity: 'ERROR',
          code: '123',
          message: 'Message code not yet implemented',
        });
        yield this.createReadyForQuery();
    }
  }

  /**
   * Checks if the given message is a valid SSL request.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-SSLREQUEST
   */
  private isSslRequest(message: Uint8Array): boolean {
    if (message.byteLength !== 8) return false;

    const dataView = new DataView(message.buffer, message.byteOffset, message.byteLength);

    const mostSignificantPart = dataView.getInt16(4);
    const leastSignificantPart = dataView.getInt16(6);

    return mostSignificantPart === 1234 && leastSignificantPart === 5679;
  }

  /**
   * Checks if the given message is a valid StartupMessage.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-STARTUPMESSAGE
   */
  private isStartupMessage(message: Uint8Array): boolean {
    if (message.byteLength < 8) return false;

    const dataView = new DataView(message.buffer, message.byteOffset, message.byteLength);

    const length = dataView.getInt32(0);
    const majorVersion = dataView.getInt16(4);
    const minorVersion = dataView.getInt16(6);

    return message.byteLength === length && majorVersion === 3 && minorVersion === 0;
  }

  /**
   * Completes authentication by forwarding the appropriate messages
   * to the frontend.
   */
  async *completeAuthentication() {
    this.isAuthenticated = true;

    yield this.createAuthenticationOk();

    await this.options.onAuthenticated?.(this.state);

    if (this.options.serverVersion) {
      let serverVersion: string;
      if (typeof this.options.serverVersion === 'function') {
        serverVersion = await this.options.serverVersion(this.state);
      } else {
        serverVersion = this.options.serverVersion;
      }
      yield this.createParameterStatus('server_version', serverVersion);
    }

    this.step = ServerStep.ReadyForQuery;
    yield this.createReadyForQuery();
  }

  /**
   * Parses a startup message from the frontend.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-STARTUPMESSAGE
   */
  readStartupMessage() {
    const length = this.reader.int32();
    const majorVersion = this.reader.int16();
    const minorVersion = this.reader.int16();

    const parameters: Record<string, string> = {};

    // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
    for (let key: string; (key = this.reader.cstring()) !== ''; ) {
      parameters[key] = this.reader.cstring();
    }

    return {
      majorVersion,
      minorVersion,
      parameters,
    };
  }

  /**
   * Parses a query message from the frontend.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-QUERY
   */
  readQuery() {
    const query = this.reader.cstring();

    return {
      query,
    };
  }

  /**
   * Creates an "AuthenticationOk" message.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-AUTHENTICATIONOK
   */
  createAuthenticationOk() {
    this.writer.addInt32(0);
    return this.writer.flush(BackendMessageCode.AuthenticationResponse);
  }

  /**
   * Creates a "ParameterStatus" message.
   * Informs the frontend about the current setting of backend parameters.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-PARAMETERSTATUS
   * @see https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-ASYNC
   */
  createParameterStatus(name: string, value: string) {
    this.writer.addCString(name);
    this.writer.addCString(value);
    return this.writer.flush(BackendMessageCode.ParameterStatus);
  }

  /**
   * Creates a "ReadyForQuery" message.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-READYFORQUERY
   */
  createReadyForQuery(transactionStatus: 'idle' | 'transaction' | 'error' = 'idle') {
    switch (transactionStatus) {
      case 'idle':
        this.writer.addString('I');
        break;
      case 'transaction':
        this.writer.addString('T');
        break;
      case 'error':
        this.writer.addString('E');
        break;
      default:
        throw new Error(`Unknown transaction status '${transactionStatus}'`);
    }

    return this.writer.flush(BackendMessageCode.ReadyForQuery);
  }

  createAuthenticationFailedError() {
    return createBackendErrorMessage({
      severity: 'FATAL',
      code: '28P01',
      message: this.clientInfo?.parameters.user
        ? `password authentication failed for user "${this.clientInfo.parameters.user}"`
        : 'password authentication failed',
    });
  }
}
