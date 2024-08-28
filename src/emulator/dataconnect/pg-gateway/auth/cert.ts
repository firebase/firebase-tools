import type { Socket } from 'node:net';
import { type PeerCertificate, TLSSocket } from 'node:tls';
import type { BufferReader } from '../buffer-reader.js';
import type { BufferWriter } from '../buffer-writer.js';
import type { ConnectionState } from '../connection.types';
import { BaseAuthFlow } from './base-auth-flow';

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
        (async ({ username, certificate }) => {
          return certificate.subject.CN === username;
        }),
    };
    this.username = params.username;
  }

  async handleClientMessage(message: Buffer): Promise<void> {
    if (!(this.socket instanceof TLSSocket)) {
      this.sendError({
        severity: 'FATAL',
        code: '08000',
        message: `ssl connection required when auth mode is 'certificate'`,
      });
      this.socket.end();
      return;
    }

    if (!this.socket.authorized) {
      this.sendError({
        severity: 'FATAL',
        code: '08000',
        message: 'client certificate is invalid',
      });
      this.socket.end();
      return;
    }

    this.socket.pause();
    const isValid = await this.auth.validateCredentials(
      {
        username: this.username,
        certificate: this.socket.getPeerCertificate(),
      },
      this.connectionState,
    );
    this.socket.resume();

    if (!isValid) {
      this.sendError({
        severity: 'FATAL',
        code: '08000',
        message: 'client certificate is invalid',
      });
      this.socket.end();
      return;
    }

    this.completed = true;
  }

  override sendInitialAuthMessage(): void {
    return;
  }

  get isCompleted(): boolean {
    return this.completed;
  }
}
