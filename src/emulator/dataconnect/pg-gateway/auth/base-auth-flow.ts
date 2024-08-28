import type { Socket } from 'node:net';
import {
  type BackendError,
  createBackendErrorMessage,
} from '../backend-error.js';
import type { BufferReader } from '../buffer-reader.js';
import type { BufferWriter } from '../buffer-writer.js';
import type { ConnectionState } from '../connection.types.js';

export interface AuthFlow {
  sendInitialAuthMessage(): void;
  handleClientMessage(message: Buffer): Promise<void>;
  isCompleted: boolean;
}

export abstract class BaseAuthFlow implements AuthFlow {
  protected socket: Socket;
  protected reader: BufferReader;
  protected writer: BufferWriter;
  protected connectionState: ConnectionState;

  constructor(params: {
    socket: Socket;
    reader: BufferReader;
    writer: BufferWriter;
    connectionState: ConnectionState;
  }) {
    this.socket = params.socket;
    this.reader = params.reader;
    this.writer = params.writer;
    this.connectionState = params.connectionState;
  }

  abstract sendInitialAuthMessage(): void;
  abstract handleClientMessage(message: Buffer): Promise<void>;
  abstract get isCompleted(): boolean;

  protected sendError(error: BackendError) {
    const errorMessage = createBackendErrorMessage(error);
    this.socket.write(errorMessage);
  }
}
