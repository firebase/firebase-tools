/**
 * Handles buffering of messages for a connection
 */
export class MessageBuffer {
  private buffer: Buffer = Buffer.alloc(0);
  private bufferLength = 0;
  private bufferOffset = 0;

  /**
   * Merges a new buffer into the existing buffer
   *
   * @see https://github.com/brianc/node-postgres/blob/54eb0fa216aaccd727765641e7d1cf5da2bc483d/packages/pg-protocol/src/parser.ts#L121-L152
   */
  mergeBuffer(newData: Buffer): void {
    if (this.bufferLength > 0) {
      const newLength = this.bufferLength + newData.byteLength;
      const newFullLength = newLength + this.bufferOffset;

      if (newFullLength > this.buffer.byteLength) {
        let newBuffer: Buffer;
        if (
          newLength <= this.buffer.byteLength &&
          this.bufferOffset >= this.bufferLength
        ) {
          newBuffer = this.buffer;
        } else {
          let newBufferLength = this.buffer.byteLength * 2;
          while (newLength >= newBufferLength) {
            newBufferLength *= 2;
          }
          newBuffer = Buffer.allocUnsafe(newBufferLength);
        }
        this.buffer.copy(
          newBuffer,
          0,
          this.bufferOffset,
          this.bufferOffset + this.bufferLength,
        );
        this.buffer = newBuffer;
        this.bufferOffset = 0;
      }
      newData.copy(this.buffer, this.bufferOffset + this.bufferLength);
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
  async processMessages(
    messageHandler: (message: Buffer) => Promise<void>,
    hasStarted: boolean,
  ): Promise<void> {
    const bufferFullLength = this.bufferOffset + this.bufferLength;
    let offset = this.bufferOffset;

    // The initial message only has a 4 byte header containing the message length
    // while all subsequent messages have a 5 byte header containing first a single
    // byte code then a 4 byte message length
    const codeLength = !hasStarted ? 0 : 1;
    const headerLength = 4 + codeLength;

    while (offset + headerLength <= bufferFullLength) {
      // The length passed in the message header
      const length = this.buffer.readUInt32BE(offset + codeLength);

      // The length passed in the message header does not include the first single
      // byte code, so we account for it here
      const fullMessageLength = codeLength + length;

      if (offset + fullMessageLength <= bufferFullLength) {
        const messageData = this.buffer.subarray(
          offset,
          offset + fullMessageLength,
        );
        await messageHandler(messageData);
        offset += fullMessageLength;
      } else {
        break;
      }
    }

    if (offset === bufferFullLength) {
      this.buffer = Buffer.alloc(0);
      this.bufferLength = 0;
      this.bufferOffset = 0;
    } else {
      this.bufferLength = bufferFullLength - offset;
      this.bufferOffset = offset;
    }
  }
}
