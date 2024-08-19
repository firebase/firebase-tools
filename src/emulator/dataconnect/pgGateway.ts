import { Socket } from 'node:net';
import { createHash } from 'node:crypto';
import { createSecureContext, TLSSocket, TLSSocketOptions } from 'node:tls';
import { BufferReader } from 'pg-protocol/dist/buffer-reader';
import { Writer } from 'pg-protocol/dist/buffer-writer';

/**
 * Code in this file has been copied from https://github.com/supabase-community/pg-gateway/tree/main/packages/pg-gateway
 * and modified slightly for our use case.
 */
export const enum FrontendMessageCode {
  Query = 0x51, // Q
  Parse = 0x50, // P
  Bind = 0x42, // B
  Execute = 0x45, // E
  FunctionCall = 0x46, // F
  Flush = 0x48, // H
  Close = 0x43, // C
  Describe = 0x44, // D
  CopyFromChunk = 0x64, // d
  CopyDone = 0x63, // c
  CopyData = 0x64, // d
  CopyFail = 0x66, // f
  Password = 0x70, // p
  Sync = 0x53, // S
  Terminate = 0x58, // X
}

export const enum BackendMessageCode {
  DataRow = 0x44, // D
  ParseComplete = 0x31, // 1
  BindComplete = 0x32, // 2
  CloseComplete = 0x33, // 3
  CommandComplete = 0x43, // C
  ReadyForQuery = 0x5a, // Z
  NoData = 0x6e, // n
  NotificationResponse = 0x41, // A
  AuthenticationResponse = 0x52, // R
  ParameterStatus = 0x53, // S
  BackendKeyData = 0x4b, // K
  ErrorMessage = 0x45, // E
  NoticeMessage = 0x4e, // N
  RowDescriptionMessage = 0x54, // T
  ParameterDescriptionMessage = 0x74, // t
  PortalSuspended = 0x73, // s
  ReplicationStart = 0x57, // W
  EmptyQuery = 0x49, // I
  CopyIn = 0x47, // G
  CopyOut = 0x48, // H
  CopyDone = 0x63, // c
  CopyData = 0x64, // d
}

/**
 * Modified from pg-protocol to require certain fields.
 */
export interface BackendError {
  severity: 'ERROR' | 'FATAL' | 'PANIC';
  code: string;
  message: string;
  detail?: string;
  hint?: string;
  position?: string;
  internalPosition?: string;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;
  file?: string;
  line?: string;
  routine?: string;
}

export type CleartextPasswordCredentials = {
  authMode: 'cleartextPassword';
  user: string;
  password: string;
};

export type Md5PasswordCredentials = {
  authMode: 'md5Password';
  user: string;
  hash: string;
  salt: Uint8Array;
};

export type Credentials = CleartextPasswordCredentials | Md5PasswordCredentials;

export type TlsOptions = {
  key: Buffer;
  cert: Buffer;
  ca?: Buffer;
  passphrase?: string;
};

export type TlsOptionsCallback = (
  tlsInfo: TlsInfo
) => TlsOptions | Promise<TlsOptions>;

export type PostgresConnectionOptions = {
  /**
   * The server version to send to the frontend.
   */
  serverVersion?: string;

  /**
   * The authentication mode for the server.
   */
  authMode?: 'none' | 'cleartextPassword' | 'md5Password' | 'certificate';

  /**
   * TLS options for when clients send an SSLRequest.
   */
  tls?: TlsOptions | TlsOptionsCallback;

  /**
   * Validates authentication credentials based on the auth mode set.
   *
   * Includes `state` which holds connection information gathered so far.
   *
   * Callback should return `true` if credentials are valid and
   * `false` if credentials are invalid.
   */
  validateCredentials?(
    credentials: Credentials,
    state: State
  ): boolean | Promise<boolean>;

  /**
   * Callback after the connection has been upgraded to TLS.
   *
   * Includes `state` which holds connection information gathered so far like `tlsInfo`.
   *
   * This will be called before the startup message is received from the frontend
   * (if TLS is being used) so is a good place to establish proxy connections if desired.
   */
  onTlsUpgrade?(state: State): void | Promise<void>;

  /**
   * Callback after the initial startup message has been received from the frontend.
   *
   * Includes `state` which holds connection information gathered so far like `clientInfo`.
   *
   * This is called after the connection is upgraded to TLS (if TLS is being used)
   * but before authentication messages are sent to the frontend.
   *
   * Callback should return `true` to indicate that it has responded to the startup
   * message and no further processing should occur. Return `false` to continue
   * built-in processing.
   *
   * **Warning:** By managing the post-startup response yourself (returning `true`),
   * you bypass further processing by the `PostgresConnection` which means some state
   * may not be collected and hooks won't be called.
   */
  onStartup?(state: State): boolean | Promise<boolean>;

  /**
   * Callback after a successful authentication has completed.
   *
   * Includes `state` which holds connection information gathered so far.
   */
  onAuthenticated?(state: State): void | Promise<void>;
  /**
   * Callback for every message received from the frontend.
   * Use this as an escape hatch to manually handle raw message data.
   *
   * Includes `state` which holds connection information gathered so far and
   * can be used to understand where the protocol is at in its lifecycle.
   *
   * Callback should return `true` to indicate that it has responded to the message
   * and no further processing should occur. Return `false` to continue
   * built-in processing.
   *
   * **Warning:** By managing the message yourself (returning `true`), you bypass further
   * processing by the `PostgresConnection` which means some state may not be collected
   * and hooks won't be called depending on where the protocol is at in its lifecycle.
   */
  onMessage?(data: Uint8Array, state: State): boolean | Promise<boolean>;

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
  onQuery?(query: string, state: State): Uint8Array | Promise<Uint8Array>;
};

export type ClientParameters = {
  user: string;
  [key: string]: string;
};

export type ClientInfo = {
  majorVersion: number;
  minorVersion: number;
  parameters: ClientParameters;
};

export type TlsInfo = {
  sniServerName?: string;
};

export type State = {
  hasStarted: boolean;
  isAuthenticated: boolean;
  clientInfo?: ClientInfo;
  tlsInfo?: TlsInfo;
};

export class PostgresConnection {
  secureSocket?: TLSSocket;
  hasStarted = false;
  isAuthenticated = false;
  writer = new Writer();
  reader = new BufferReader();
  md5Salt = generateMd5Salt();
  clientInfo?: ClientInfo;
  tlsInfo?: TlsInfo;

  private boundDataHandler: (data: Buffer) => Promise<void>;

  private buffer: Buffer = Buffer.alloc(0);
  private bufferLength: number = 0;
  private bufferOffset: number = 0;

  constructor(
    public socket: Socket,
    public options: PostgresConnectionOptions = {}
  ) {
    if (!options.authMode) {
      options.authMode = 'md5Password';
    }

    this.boundDataHandler = this.handleData.bind(this);
    this.createSocketHandlers(socket);
  }

  get state(): State {
    return {
      hasStarted: this.hasStarted,
      isAuthenticated: this.isAuthenticated,
      clientInfo: this.clientInfo,
      tlsInfo: this.tlsInfo,
    };
  }

  createSocketHandlers(socket: Socket) {
    socket.on('data', this.boundDataHandler);
  }

  removeSocketHandlers(socket: Socket) {
    socket.off('data', this.boundDataHandler);
  }

  /**
   * Detaches the `PostgresConnection` from the socket.
   * After calling this, no more handlers will be called
   * and data will no longer be buffered.
   *
   * @returns The underlying socket (which could have been upgraded to a `TLSSocket`)
   */
  detach() {
    console.log("Deatching from socket");
    this.removeSocketHandlers(this.socket);
    return this.socket;
  }

  /**
   * Processes incoming data by buffering it and parsing messages.
   *
   * Inspired by https://github.com/brianc/node-postgres/blob/54eb0fa216aaccd727765641e7d1cf5da2bc483d/packages/pg-protocol/src/parser.ts#L91-L119
   */
  async handleData(data: Buffer) {
    // Wrap in try-catch to prevent server from crashing during exceptions
    try {
      this.mergeBuffer(data);

      const bufferFullLength = this.bufferOffset + this.bufferLength;
      let offset = this.bufferOffset;

      // The initial message only has a 4 byte header containing the message length
      // while all subsequent messages have a 5 byte header containing first a single
      // byte code then a 4 byte message length
      const codeLength = !this.hasStarted ? 0 : 1;
      const headerLength = 4 + codeLength;

      // If we have enough buffer to read the message header
      while (offset + headerLength <= bufferFullLength) {
        // The length passed in the message header
        const length = this.buffer.readUInt32BE(offset + codeLength);

        // The length passed in the message header does not include the first single
        // byte code, so we account for it here
        const fullMessageLength = codeLength + length;

        // If we have enough buffer to read the entire message
        if (offset + fullMessageLength <= bufferFullLength) {
          // Create a Buffer view that points to the same memory as the main buffer,
          // but crops it at the message boundaries
          const messageData = this.buffer.subarray(offset, fullMessageLength);

          // Process the message
          await this.handleMessage(messageData);

          // Move offset pointer
          offset += fullMessageLength;
        } else {
          break;
        }
      }

      if (offset === bufferFullLength) {
        // No more use for the buffer
        this.buffer = Buffer.alloc(0);
        this.bufferLength = 0;
        this.bufferOffset = 0;
      } else {
        // Adjust the cursors of remainingBuffer
        this.bufferLength = bufferFullLength - offset;
        this.bufferOffset = offset;
      }
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Merges new data with the existing buffer.
   *
   * Inspired by https://github.com/brianc/node-postgres/blob/54eb0fa216aaccd727765641e7d1cf5da2bc483d/packages/pg-protocol/src/parser.ts#L121-L152
   */
  private mergeBuffer(buffer: Buffer): void {
    // If we have left over buffer from the last packet
    if (this.bufferLength > 0) {
      const newLength = this.bufferLength + buffer.byteLength;
      const newFullLength = newLength + this.bufferOffset;

      if (newFullLength > this.buffer.byteLength) {
        // We can't concat the new buffer with the remaining one
        let newBuffer: Buffer;
        if (
          newLength <= this.buffer.byteLength &&
          this.bufferOffset >= this.bufferLength
        ) {
          // We can move the relevant part to the beginning of the buffer instead of allocating a new buffer
          newBuffer = this.buffer;
        } else {
          // Allocate a new larger buffer
          let newBufferLength = this.buffer.byteLength * 2;
          while (newLength >= newBufferLength) {
            newBufferLength *= 2;
          }
          newBuffer = Buffer.allocUnsafe(newBufferLength);
        }
        // Move the remaining buffer to the new one
        this.buffer.copy(
          newBuffer,
          0,
          this.bufferOffset,
          this.bufferOffset + this.bufferLength
        );
        this.buffer = newBuffer;
        this.bufferOffset = 0;
      }
      // Concat the new buffer with the remaining one
      buffer.copy(this.buffer, this.bufferOffset + this.bufferLength);
      this.bufferLength = newLength;
    } else {
      this.buffer = buffer;
      this.bufferOffset = 0;
      this.bufferLength = buffer.byteLength;
    }
  }

  /**
   * Processes a single PG protocol message.
   */
  async handleMessage(data: Buffer) {
    this.reader.setBuffer(0, data);

    // If the `onMessage()` hook returns `true`, it managed this response so skip further processing
    // We must pause/resume the socket before/after each hook to prevent race conditions
    this.socket.pause();
    const messageSkip = await this.options.onMessage?.(data, this.state);
    this.socket.resume();

    if (!this.hasStarted) {
      if (this.isSslRequest(data)) {
        // `onMessage()` returned true, so skip further processing
        if (messageSkip) {
          return;
        }

        // If no TLS options are set, respond with 'N' to indicate TLS is not supported
        if (!this.options.tls) {
          this.writer.addString('N');
          const result = this.writer.flush();
          this.sendData(result);
          return;
        }

        // Otherwise respond with 'S' to indicate it is supported
        this.writer.addString('S');
        const result = this.writer.flush();
        this.sendData(result);

        // From now on the frontend will communicate via TLS, so upgrade the connection
        await this.upgradeToTls(this.options.tls);
        return;
      }

      // Otherwise this is a StartupMessage

      // `onMessage()` returned true, so skip further processing
      if (messageSkip) {
        // We need to track `hasStarted` despite `messageSkip`, because without it,
        // our `handleData()` method will incorrectly buffer/parse future messages
        this.hasStarted = true;
        return;
      }

      const { majorVersion, minorVersion, parameters } =
        this.readStartupMessage();

      // user is required
      if (!parameters.user) {
        this.sendError({
          severity: 'FATAL',
          code: '08000',
          message: `user is required`,
        });
        this.socket.end();
        return;
      }

      if (majorVersion !== 3 || minorVersion !== 0) {
        this.sendError({
          severity: 'FATAL',
          code: '08000',
          message: `Unsupported protocol version ${majorVersion.toString()}.${minorVersion.toString()}`,
        });
        this.socket.end();
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

      // We must pause/resume the socket before/after each hook to prevent race conditions
      this.socket.pause();
      const startupSkip = await this.options.onStartup?.(this.state);
      this.socket.resume();

      // `onStartup()` returned true, so skip further processing
      if (startupSkip) {
        return;
      }

      // Handle authentication modes
      switch (this.options.authMode) {
        case 'none': {
          await this.completeAuthentication();
          break;
        }
        case 'cleartextPassword': {
          this.sendAuthenticationCleartextPassword();
          break;
        }
        case 'md5Password': {
          this.sendAuthenticationMD5Password(this.md5Salt);
          break;
        }
        case 'certificate': {
          if (!this.secureSocket) {
            this.sendError({
              severity: 'FATAL',
              code: '08000',
              message: `ssl connection required when auth mode is 'certificate'`,
            });
            this.socket.end();
            return;
          }

          if (!this.secureSocket.authorized) {
            this.sendError({
              severity: 'FATAL',
              code: '08000',
              message: `client certificate is invalid`,
            });
            this.socket.end();
            return;
          }

          const cert = this.secureSocket.getPeerCertificate();
          const clientCN = cert.subject.CN;

          if (clientCN !== this.clientInfo.parameters.user) {
            this.sendError({
              severity: 'FATAL',
              code: '08000',
              message: `client certificate CN '${clientCN}' does not match user '${this.clientInfo.parameters.user}'`,
            });
            this.socket.end();
            return;
          }

          // We must pause/resume the socket before/after each hook to prevent race conditions
          this.socket.pause();
          await this.completeAuthentication();
          this.socket.resume();
          break;
        }
      }

      return;
    }

    // `onMessage()` returned true, so skip further processing
    if (messageSkip) {
      return;
    }

    // Type narrowing for `this.clientInfo` - this condition should never happen
    if (!this.clientInfo) {
      this.sendError({
        severity: 'FATAL',
        code: 'XX000',
        message: `unknown client info after startup`,
      });
      this.socket.end();
      return;
    }

    const { authMode } = this.options;

    const code = this.reader.byte();
    const length = this.reader.int32();

    switch (code) {
      case FrontendMessageCode.Password: {
        switch (authMode) {
          case 'cleartextPassword': {
            const password = this.reader.cstring();

            // We must pause/resume the socket before/after each hook to prevent race conditions
            this.socket.pause();
            const valid = await this.options.validateCredentials?.(
              {
                authMode,
                user: this.clientInfo.parameters.user,
                password,
              },
              this.state
            );
            this.socket.resume();

            if (!valid) {
              this.sendAuthenticationFailedError();
              this.socket.end();
              return;
            }

            await this.completeAuthentication();
            return;
          }
          case 'md5Password': {
            const hash = this.reader.cstring();
            const valid = await this.options.validateCredentials?.(
              {
                authMode,
                user: this.clientInfo.parameters.user,
                hash,
                salt: this.md5Salt,
              },
              this.state
            );

            if (!valid) {
              this.sendAuthenticationFailedError();
              this.socket.end();
              return;
            }

            await this.completeAuthentication();
            return;
          }
        }
        return;
      }
      case FrontendMessageCode.Query: {
        const { query } = this.readQuery();

        console.log(`Query: ${query}`);

        if (this.options?.onQuery) {
          await this.options.onQuery(query, this.state)
          return;
        }

        // TODO: call `onQuery` hook to allow consumer to choose how queries are implemented

        this.sendError({
          severity: 'ERROR',
          code: '123',
          message: 'Queries not yet implemented',
        });
        this.sendReadyForQuery('idle');
        return;
      }
      // @see https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-TERMINATION
      case FrontendMessageCode.Terminate: {
        this.socket.end();
        return;
      }
    }
  }

  /**
   * Completes authentication by forwarding the appropriate messages
   * to the frontend.
   */
  async completeAuthentication() {
    console.log("Authentication Complete!", this.isAuthenticated);
    this.isAuthenticated = true;
    this.sendAuthenticationOk();

    if (this.options.serverVersion) {
      this.sendParameterStatus('server_version', this.options.serverVersion);
    }

    this.sendReadyForQuery('idle');

    // We must pause/resume the socket before/after each hook to prevent race conditions
    this.socket.pause();
    await this.options.onAuthenticated?.(this.state);
    this.socket.resume();
  }

  isSslRequest(data: Buffer) {
    const firstBytes = data.readInt16BE(4);
    const secondBytes = data.readInt16BE(6);

    return firstBytes === 1234 && secondBytes === 5679;
  }

  async createTlsSocketOptions(
    optionsOrCallback: TlsOptions | TlsOptionsCallback,
    tlsInfo: TlsInfo
  ) {
    const { key, cert, ca, passphrase } =
      typeof optionsOrCallback === 'function'
        ? await optionsOrCallback(tlsInfo)
        : optionsOrCallback;

    const tlsOptions: TLSSocketOptions = {
      key,
      cert,
      ca,
      passphrase,
    };

    // If auth mode is 'certificate' we also need to request a client cert
    if (this.options.authMode === 'certificate') {
      tlsOptions.requestCert = true;
    }

    return tlsOptions;
  }

  /**
   * Upgrades TCP socket connection to TLS.
   */
  async upgradeToTls(options: TlsOptions | TlsOptionsCallback) {
    console.log('Upgrading to tls');
    this.tlsInfo = {};

    const originalSocket = this.socket;

    // Pause the socket to avoid losing any data
    originalSocket.pause();

    // Remove event handlers on the original socket to avoid reading encrypted data
    this.removeSocketHandlers(originalSocket);

    const tlsSocketOptions = await this.createTlsSocketOptions(
      options,
      this.tlsInfo
    );

    // Create a new TLS socket and pipe the existing TCP socket to it
    this.secureSocket = new TLSSocket(originalSocket, {
      ...tlsSocketOptions,

      // This is a server-side TLS socket
      isServer: true,

      // Record SNI info and re-create TLS options based on it
      SNICallback: async (sniServerName, callback) => {
        this.tlsInfo!.sniServerName = sniServerName;

        const tlsSocketOptions = await this.createTlsSocketOptions(
          options,
          this.tlsInfo!
        );

        callback(null, createSecureContext(tlsSocketOptions));
      },
    });

    // Also pause the new secure socket until our own hooks complete
    this.secureSocket.pause();

    // Wait for TLS negotiations to complete
    await new Promise<void>((resolve) => {
      // Since we create a TLSSocket out of band from a typical tls.Server,
      // we have to manually validate client certs ourselves as done here:
      // https://github.com/nodejs/node/blob/aeaffbb385c9fc756247e6deaa70be8eb8f59496/lib/_tls_wrap.js#L1248
      this.secureSocket!.on('secure', () => {
        onServerSocketSecure.bind(this.secureSocket)();
        resolve();
      });
    });

    // Re-create event handlers for the secure socket
    this.createSocketHandlers(this.secureSocket);

    // Replace socket with the secure socket
    this.socket = this.secureSocket;

    // TLS upgrade is complete, call hook
    await this.options.onTlsUpgrade?.(this.state);

    // Pausing the secure socket until `onTlsUpgrade` completes allows the consumer to
    // asynchronously initialize anything they need before new messages arrive
    this.secureSocket.resume();

    // Resume the TCP socket
    originalSocket.resume();
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

    for (let key; (key = this.reader.cstring()) !== ''; ) {
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
   * Sends raw data to the frontend.
   */
  sendData(data: Uint8Array) {
    console.log("Socket closed?", this.socket.closed)
    this.socket.write(data);
  }

  /**
   * Sends an "AuthenticationCleartextPassword" message to the frontend.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-AUTHENTICATIONCLEARTEXTPASSWORD
   */
  sendAuthenticationCleartextPassword() {
    this.writer.addInt32(3);
    const response = this.writer.flush(
      BackendMessageCode.AuthenticationResponse
    );
    this.sendData(response);
  }

  /**
   * Sends an "AuthenticationMD5Password" message to the frontend.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-AUTHENTICATIONMD5PASSWORD
   */
  sendAuthenticationMD5Password(salt: ArrayBuffer) {
    this.writer.addInt32(5);
    this.writer.add(Buffer.from(salt));

    const response = this.writer.flush(
      BackendMessageCode.AuthenticationResponse
    );

    this.sendData(response);
  }

  /**
   * Sends an "AuthenticationOk" message to the frontend.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-AUTHENTICATIONOK
   */
  sendAuthenticationOk() {
    this.writer.addInt32(0);
    const response = this.writer.flush(
      BackendMessageCode.AuthenticationResponse
    );
    this.sendData(response);
  }

  /**
   * Sends an "ParameterStatus" message to the frontend.
   * Informs the frontend about the current setting of backend parameters.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-PARAMETERSTATUS
   * @see https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-ASYNC
   */
  sendParameterStatus(name: string, value: string) {
    this.writer.addCString(name);
    this.writer.addCString(value);
    const response = this.writer.flush(BackendMessageCode.ParameterStatus);
    this.sendData(response);
  }

  /**
   * Sends a "ReadyForQuery" message to the frontend.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-READYFORQUERY
   */
  sendReadyForQuery(
    transactionStatus: 'idle' | 'transaction' | 'error' = 'idle'
  ) {
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

    const response = this.writer.flush(BackendMessageCode.ReadyForQuery);
    this.sendData(response);
  }

  /**
   * Sends an error message to the frontend.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-ERRORRESPONSE
   *
   * For error fields, see https://www.postgresql.org/docs/current/protocol-error-fields.html#PROTOCOL-ERROR-FIELDS
   */
  sendError(error: BackendError) {
    this.writer.addString('S');
    this.writer.addCString(error.severity);

    this.writer.addString('V');
    this.writer.addCString(error.severity);

    this.writer.addString('C');
    this.writer.addCString(error.code);

    this.writer.addString('M');
    this.writer.addCString(error.message);

    if (error.detail !== undefined) {
      this.writer.addString('D');
      this.writer.addCString(error.detail);
    }

    if (error.hint !== undefined) {
      this.writer.addString('H');
      this.writer.addCString(error.hint);
    }

    if (error.position !== undefined) {
      this.writer.addString('P');
      this.writer.addCString(error.position);
    }

    if (error.internalPosition !== undefined) {
      this.writer.addString('p');
      this.writer.addCString(error.internalPosition);
    }

    if (error.internalQuery !== undefined) {
      this.writer.addString('q');
      this.writer.addCString(error.internalQuery);
    }

    if (error.where !== undefined) {
      this.writer.addString('W');
      this.writer.addCString(error.where);
    }

    if (error.schema !== undefined) {
      this.writer.addString('s');
      this.writer.addCString(error.schema);
    }

    if (error.table !== undefined) {
      this.writer.addString('t');
      this.writer.addCString(error.table);
    }

    if (error.column !== undefined) {
      this.writer.addString('c');
      this.writer.addCString(error.column);
    }

    if (error.dataType !== undefined) {
      this.writer.addString('d');
      this.writer.addCString(error.dataType);
    }

    if (error.constraint !== undefined) {
      this.writer.addString('n');
      this.writer.addCString(error.constraint);
    }

    if (error.file !== undefined) {
      this.writer.addString('F');
      this.writer.addCString(error.file);
    }

    if (error.line !== undefined) {
      this.writer.addString('L');
      this.writer.addCString(error.line);
    }

    if (error.routine !== undefined) {
      this.writer.addString('R');
      this.writer.addCString(error.routine);
    }

    // Add null byte to the end
    this.writer.addCString('');

    const response = this.writer.flush(BackendMessageCode.ErrorMessage);
    this.sendData(response);
  }

  sendAuthenticationFailedError() {
    this.sendError({
      severity: 'FATAL',
      code: '28P01',
      message: this.clientInfo?.parameters.user
        ? `password authentication failed for user "${this.clientInfo.parameters.user}"`
        : 'password authentication failed',
    });
  }
}

/**
 * Internal Node.js handler copied and modified from source to validate client certs.
 * https://github.com/nodejs/node/blob/aeaffbb385c9fc756247e6deaa70be8eb8f59496/lib/_tls_wrap.js#L1185-L1203
 *
 * Without this, `authorized` is always `false` on the TLSSocket and we never know if the client cert is valid.
 */
function onServerSocketSecure(this: TLSSocket & any) {
  if (this._requestCert) {
    const verifyError = this._handle.verifyError();
    if (verifyError) {
      this.authorizationError = verifyError.code;
    } else {
      this.authorized = true;
    }
  }
}

/**
 * Hashes a password using Postgres' nested MD5 algorithm.
 *
 * @see https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-START-UP
 */
export async function hashMd5Password(
  user: string,
  password: string,
  salt: Uint8Array
) {
  const inner = await md5(password + user);
  const outer = await md5(Buffer.concat([Buffer.from(inner), salt]));
  return 'md5' + outer;
}

export async function md5(value: string | Buffer) {
  return createHash('md5').update(value).digest('hex');
}

export function generateMd5Salt() {
  const salt = new Uint8Array(4);
  crypto.getRandomValues(salt);
  return salt;
}