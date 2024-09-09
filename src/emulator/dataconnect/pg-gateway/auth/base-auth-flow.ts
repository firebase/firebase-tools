import type { BufferReader } from '../buffer-reader.js';
import type { BufferWriter } from '../buffer-writer.js';
import type { ConnectionSignal } from '../connection.js';
import type { ConnectionState } from '../connection.types.js';

export interface AuthFlow {
  createInitialAuthMessage(): Uint8Array | undefined;
  handleClientMessage(message: BufferSource): AsyncGenerator<Uint8Array | ConnectionSignal>;
  isCompleted: boolean;
}

export abstract class BaseAuthFlow implements AuthFlow {
  protected reader: BufferReader;
  protected writer: BufferWriter;
  protected connectionState: ConnectionState;

  constructor(params: {
    reader: BufferReader;
    writer: BufferWriter;
    connectionState: ConnectionState;
  }) {
    this.reader = params.reader;
    this.writer = params.writer;
    this.connectionState = params.connectionState;
  }

  abstract createInitialAuthMessage(): Uint8Array | undefined;
  abstract handleClientMessage(
    message: BufferSource,
  ): AsyncGenerator<Uint8Array | ConnectionSignal>;
  abstract get isCompleted(): boolean;
}
