const emptyBuffer = Buffer.allocUnsafe(0);

/**
 * binary data reader tuned for decoding binary specific to the postgres binary protocol
 *
 * @see https://github.com/brianc/node-postgres/blob/54eb0fa216aaccd727765641e7d1cf5da2bc483d/packages/pg-protocol/src/buffer-reader.ts
 */
export class BufferReader {
  private buffer: Buffer = emptyBuffer;

  // TODO(bmc): support non-utf8 encoding?
  private encoding = 'utf-8' as const;

  constructor(private offset = 0) {}

  public setBuffer(offset: number, buffer: Buffer): void {
    this.offset = offset;
    this.buffer = buffer;
  }

  public int16(): number {
    const result = this.buffer.readInt16BE(this.offset);
    this.offset += 2;
    return result;
  }

  public byte(): number {
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    const result = this.buffer[this.offset]!;
    this.offset++;
    return result;
  }

  public int32(): number {
    const result = this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return result;
  }

  public string(length: number): string {
    const result = this.buffer.toString(
      this.encoding,
      this.offset,
      this.offset + length,
    );
    this.offset += length;
    return result;
  }

  public cstring(): string {
    const start = this.offset;
    let end = start;
    while (this.buffer[end++] !== 0) {}
    this.offset = end;
    return this.buffer.toString(this.encoding, start, end - 1);
  }

  public bytes(length: number): Buffer {
    const result = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }
}
