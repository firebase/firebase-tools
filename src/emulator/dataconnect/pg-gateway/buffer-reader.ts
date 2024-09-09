/**
 * Binary data reader tuned for decoding the Postgres wire protocol.
 *
 * @see https://github.com/brianc/node-postgres/blob/54eb0fa216aaccd727765641e7d1cf5da2bc483d/packages/pg-protocol/src/buffer-reader.ts
 */
export class BufferReader {
  private buffer = new Uint8Array();
  private decoder = new TextDecoder();

  constructor(private offset = 0) {}

  public setBuffer(buffer: Uint8Array, offset = 0): void {
    this.buffer = buffer;
    this.offset = offset;
  }

  public int16(): number {
    const dataView = new DataView(
      this.buffer.buffer,
      this.buffer.byteOffset,
      this.buffer.byteLength,
    );
    const result = dataView.getInt16(this.offset);
    this.offset += 2;
    return result;
  }

  public byte(): number {
    const dataView = new DataView(
      this.buffer.buffer,
      this.buffer.byteOffset,
      this.buffer.byteLength,
    );
    const result = dataView.getUint8(this.offset);
    this.offset++;
    return result;
  }

  public int32(): number {
    const dataView = new DataView(
      this.buffer.buffer,
      this.buffer.byteOffset,
      this.buffer.byteLength,
    );
    const result = dataView.getInt32(this.offset);
    this.offset += 4;
    return result;
  }

  public string(length: number): string {
    const dataView = new DataView(this.buffer.buffer, this.offset, length);
    this.offset += length;
    return this.decoder.decode(dataView);
  }

  public cstring(): string {
    const start = this.offset;
    let end = start;
    while ((this.buffer[end++] ?? 0) !== 0) {}
    if (this.buffer[end - 1] === undefined) {
      throw new Error('Reached end of buffer before null character found for PG String');
    }
    const dataView = new DataView(this.buffer.buffer, start, end - start - 1);
    this.offset = end;
    return this.decoder.decode(dataView);
  }

  public bytes(length: number): Uint8Array {
    const result = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }
}
