import type { PeerCertificate } from 'node:tls';
import { createBackendErrorMessage } from '../backend-error';
import type { BufferReader } from '../buffer-reader';
import type { BufferWriter } from '../buffer-writer';
import type { ConnectionState } from '../connection.types';
import { BaseAuthFlow } from './base-auth-flow';
import { closeSignal } from '../connection';

type BufferSource = ArrayBufferView | ArrayBuffer;

export type CertAuthOptions = {
  method: 'cert';
  validateCredentials?: (
    credentials: {
      username: string;
      certificate: PeerCertificate;
    },
    connectionState: ConnectionState,
  ) => boolean | Promise<boolean>;
};

export class CertAuthFlow extends BaseAuthFlow {
  private auth: CertAuthOptions & {
    validateCredentials: NonNullable<CertAuthOptions['validateCredentials']>;
  };
  private username: string;
  private completed = false;

  constructor(params: {
    auth: CertAuthOptions;
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
        (async ({ username, certificate }) => {
          return certificate.subject.CN === username;
        }),
    };
    this.username = params.username;
  }

  async *handleClientMessage(message: BufferSource) {
    // biome-ignore lint/correctness/noConstantCondition: TODO: detect TLS state
    if (false) {
      yield createBackendErrorMessage({
        severity: 'FATAL',
        code: '08000',
        message: `ssl connection required when auth mode is 'certificate'`,
      });
      yield closeSignal;
      return;
    }

    // biome-ignore lint/correctness/noConstantCondition: TODO: detect if cert authorized
    if (false) {
      yield createBackendErrorMessage({
        severity: 'FATAL',
        code: '08000',
        message: 'client certificate is invalid',
      });
      yield closeSignal;
      return;
    }

    // TODO: get peer cert and validate through hook
    const isValid = false;

    // const isValid = await this.auth.validateCredentials(
    //   {
    //     username: this.username,
    //     certificate:  this.socket.getPeerCertificate(),
    //   },
    //   this.connectionState,
    // );

    if (!isValid) {
      yield createBackendErrorMessage({
        severity: 'FATAL',
        code: '08000',
        message: 'client certificate is invalid',
      });
      yield closeSignal;
      return;
    }

    this.completed = true;
  }

  override createInitialAuthMessage() {
    return undefined;
  }

  get isCompleted(): boolean {
    return this.completed;
  }
}
