import type { BufferReader } from '../buffer-reader';
import type { BufferWriter } from '../buffer-writer';
import type { ConnectionState } from '../connection.types';
import type { AuthFlow } from './base-auth-flow';
import { CertAuthFlow, type CertAuthOptions } from './cert';
import { Md5AuthFlow, type Md5AuthOptions } from './md5';
import { PasswordAuthFlow, type PasswordAuthOptions } from './password';
import { ScramSha256AuthFlow, type ScramSha256AuthOptions } from './sasl/scram-sha-256';
import type { TrustAuthOptions } from './trust';

export type AuthOptions =
  | TrustAuthOptions
  | PasswordAuthOptions
  | Md5AuthOptions
  | ScramSha256AuthOptions
  | CertAuthOptions;

export function createAuthFlow(options: {
  reader: BufferReader;
  writer: BufferWriter;
  auth: AuthOptions;
  username: string;
  connectionState: ConnectionState;
}): AuthFlow {
  switch (options.auth.method) {
    case 'password':
      return new PasswordAuthFlow({ ...options, auth: options.auth });
    case 'md5':
      return new Md5AuthFlow({ ...options, auth: options.auth });
    case 'scram-sha-256':
      return new ScramSha256AuthFlow({ ...options, auth: options.auth });
    case 'cert':
      return new CertAuthFlow({ ...options, auth: options.auth });
    default:
      throw new Error(`Unsupported auth method: ${options.auth.method}`);
  }
}
