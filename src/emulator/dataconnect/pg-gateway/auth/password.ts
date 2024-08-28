import type { Socket } from 'node:net';
import type { BufferReader } from '../buffer-reader.js';
import type { BufferWriter } from '../buffer-writer.js';
import type { ConnectionState } from '../connection.types';
import { BackendMessageCode } from '../message-codes';
import { BaseAuthFlow } from './base-auth-flow';

export type ClearTextPassword = string;

export type PasswordAuthOptions = {
  method: 'password';
  validateCredentials?: (
    credentials: {
      username: string;
      password: string;
      clearTextPassword: ClearTextPassword;
    },
    connectionState: ConnectionState,
  ) => boolean | Promise<boolean>;
  getClearTextPassword: (
    params: {
      username: string;
    },
    connectionState: ConnectionState,
  ) => ClearTextPassword | Promise<ClearTextPassword>;
};

export class PasswordAuthFlow extends BaseAuthFlow {
  private auth: PasswordAuthOptions & {
    validateCredentials: NonNullable<
      PasswordAuthOptions['validateCredentials']
    >;
  };
  private username: string;
  private completed = false;

  constructor(params: {
    auth: PasswordAuthOptions;
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
        (async ({ password, clearTextPassword }) => {
          return password === clearTextPassword;
        }),
    };
    this.username = params.username;
  }

  async handleClientMessage(message: Buffer): Promise<void> {
    const length = this.reader.int32();
    const password = this.reader.cstring();

    this.socket.pause();
    const clearTextPassword = await this.auth.getClearTextPassword(
      {
        username: this.username,
      },
      this.connectionState,
    );
    const isValid = await this.auth.validateCredentials(
      {
        username: this.username,
        password,
        clearTextPassword,
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
    this.sendAuthenticationCleartextPassword();
  }

  get isCompleted(): boolean {
    return this.completed;
  }

  /**
   * Sends an "AuthenticationCleartextPassword" message to the frontend.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-AUTHENTICATIONCLEARTEXTPASSWORD
   */
  private sendAuthenticationCleartextPassword() {
    this.writer.addInt32(3);
    const response = this.writer.flush(
      BackendMessageCode.AuthenticationResponse,
    );
    this.socket.write(response);
  }
}
