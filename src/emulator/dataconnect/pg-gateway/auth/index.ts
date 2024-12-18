import type { BufferReader } from '../buffer-reader.js';
import type { BufferWriter } from '../buffer-writer.js';
import type { ConnectionState } from '../connection.types.js';
import type { AuthFlow } from './base-auth-flow.js';
import { CertAuthFlow, type CertAuthOptions } from './cert.js';
import { Md5AuthFlow, type Md5AuthOptions } from './md5.js';
import { PasswordAuthFlow, type PasswordAuthOptions } from './password.js';
import type { TrustAuthOptions } from './trust.js';

export type AuthOptions =
  | TrustAuthOptions
  | PasswordAuthOptions
  | Md5AuthOptions
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
    case 'cert':
      return new CertAuthFlow({ ...options, auth: options.auth });
    default:
      throw new Error(`Unsupported auth method: ${options.auth.method}`);
  }
}
