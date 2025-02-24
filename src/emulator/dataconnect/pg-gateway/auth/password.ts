import { createBackendErrorMessage } from '../backend-error';
import type { BufferReader } from '../buffer-reader';
import type { BufferWriter } from '../buffer-writer';
import { closeSignal } from '../connection';
import type { ConnectionState } from '../connection.types';
import { BackendMessageCode } from '../message-codes';
import { BaseAuthFlow } from './base-auth-flow';

type BufferSource = ArrayBufferView | ArrayBuffer;

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
    validateCredentials: NonNullable<PasswordAuthOptions['validateCredentials']>;
  };
  private username: string;
  private completed = false;

  constructor(params: {
    auth: PasswordAuthOptions;
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
        (async ({ password, clearTextPassword }) => {
          return password === clearTextPassword;
        }),
    };
    this.username = params.username;
  }

  async *handleClientMessage(message: BufferSource) {
    const length = this.reader.int32();
    const password = this.reader.cstring();

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
    return this.createAuthenticationCleartextPassword();
  }

  get isCompleted(): boolean {
    return this.completed;
  }

  /**
   * Create an "AuthenticationCleartextPassword" message.
   *
   * @see https://www.postgresql.org/docs/current/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-AUTHENTICATIONCLEARTEXTPASSWORD
   */
  private createAuthenticationCleartextPassword() {
    this.writer.addInt32(3);
    return this.writer.flush(BackendMessageCode.AuthenticationResponse);
  }
}
