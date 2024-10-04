import { copy } from './utils';

/**
 * Handles buffering of messages for a connection
 */
export class MessageBuffer {
  private buffer = new Uint8Array();
  private bufferLength = 0;
  private bufferOffset = 0;

  /**
   * Merges a new buffer into the existing buffer
   *
   * @see https://github.com/brianc/node-postgres/blob/54eb0fa216aaccd727765641e7d1cf5da2bc483d/packages/pg-protocol/src/parser.ts#L121-L152
   */
  mergeBuffer(newData: Uint8Array): void {
    if (this.bufferLength > 0) {
      const newLength = this.bufferLength + newData.byteLength;
      const newFullLength = newLength + this.bufferOffset;

      if (newFullLength > this.buffer.byteLength) {
        let newBuffer: Uint8Array;
        if (newLength <= this.buffer.byteLength && this.bufferOffset >= this.bufferLength) {
          newBuffer = this.buffer;
        } else {
          let newBufferLength = this.buffer.byteLength * 2;
          while (newLength >= newBufferLength) {
            newBufferLength *= 2;
          }
          newBuffer = new Uint8Array(newBufferLength);
        }
        const bufferView = this.buffer.subarray(
          this.bufferOffset,
          this.bufferOffset + this.bufferLength,
        );
        copy(bufferView, newBuffer, 0);
        this.buffer = newBuffer;
        this.bufferOffset = 0;
      }
      copy(newData, this.buffer, this.bufferOffset + this.bufferLength);
      this.bufferLength = newLength;
    } else {
      this.buffer = newData;
      this.bufferOffset = 0;
      this.bufferLength = newData.byteLength;
    }
  }

  /**
   * Processes incoming data by buffering it and parsing messages.
   *
   * @see https://github.com/brianc/node-postgres/blob/54eb0fa216aaccd727765641e7d1cf5da2bc483d/packages/pg-protocol/src/parser.ts#L91-L119
   */
  async *processMessages(hasStarted: boolean) {
    const bufferFullLength = this.bufferOffset + this.bufferLength;
    let offset = this.bufferOffset;

    // The initial message only has a 4 byte header containing the message length
    // while all subsequent messages have a 5 byte header containing first a single
    // byte code then a 4 byte message length
    const codeLength = !hasStarted ? 0 : 1;
    const headerLength = 4 + codeLength;

    while (offset + headerLength <= bufferFullLength) {
      // The length passed in the message header
      const dataView = new DataView(this.buffer.buffer);
      const length = dataView.getUint32(offset + codeLength);

      // The length passed in the message header does not include the first single
      // byte code, so we account for it here
      const fullMessageLength = codeLength + length;

      if (offset + fullMessageLength <= bufferFullLength) {
        yield this.buffer.subarray(offset, offset + fullMessageLength);
        offset += fullMessageLength;
      } else {
        break;
      }
    }

    if (offset === bufferFullLength) {
      this.buffer = new Uint8Array();
      this.bufferLength = 0;
      this.bufferOffset = 0;
    } else {
      this.bufferLength = bufferFullLength - offset;
      this.bufferOffset = offset;
    }
  }
}

export function* getMessages(data: Uint8Array) {
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  if (dataView.byteLength === 0) {
    return;
  }

  while (offset < dataView.byteLength) {
    const length = dataView.getUint32(offset + 1);
    yield data.subarray(offset, offset + length + 1);
    offset += length + 1;
  }
}
