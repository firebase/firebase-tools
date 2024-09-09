import type { BufferWriter } from '../../buffer-writer';
import { BackendMessageCode } from '../../message-codes';

const SaslMessageCode = {
  AuthenticationSASL: 10,
  AuthenticationSASLContinue: 11,
  AuthenticationSASLFinal: 12,
} as const;

export class SaslMechanism {
  writer: BufferWriter;
  constructor(params: {
    writer: BufferWriter;
  }) {
    this.writer = params.writer;
  }

  createAuthenticationSASL() {
    const mechanisms = ['SCRAM-SHA-256'];
    this.writer.addInt32(SaslMessageCode.AuthenticationSASL);
    for (const mechanism of mechanisms) {
      this.writer.addCString(mechanism);
    }
    this.writer.addCString('');
    return this.writer.flush(BackendMessageCode.AuthenticationResponse);
  }

  createAuthenticationSASLContinue(message: string) {
    this.writer.addInt32(SaslMessageCode.AuthenticationSASLContinue);
    this.writer.addString(message);
    return this.writer.flush(BackendMessageCode.AuthenticationResponse);
  }

  createAuthenticationSASLFinal(message: string) {
    this.writer.addInt32(SaslMessageCode.AuthenticationSASLFinal);
    this.writer.addString(message);
    return this.writer.flush(BackendMessageCode.AuthenticationResponse);
  }
}
