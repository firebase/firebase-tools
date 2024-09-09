import { copy } from "./utils";
/**
 * binary data  BufferWriter tuned for encoding binary specific to the postgres binary protocol
 *
 * @see https://github.com/brianc/node-postgres/blob/54eb0fa216aaccd727765641e7d1cf5da2bc483d/packages/pg-protocol/src/buffer- BufferWriter.ts
 */
export class BufferWriter {
  private buffer: Uint8Array;
  private offset = 5;
  private headerPosition = 0;
  private encoder = new TextEncoder();

  constructor(private size = 256) {
    this.buffer = new Uint8Array(size);
  }

  private ensure(size: number): void {
    const remaining = this.buffer.length - this.offset;
    if (remaining < size) {
      const oldBuffer = this.buffer;
      // exponential growth factor of around ~ 1.5
      // https://stackoverflow.com/questions/2269063/buffer-growth-strategy
      const newSize = oldBuffer.length + (oldBuffer.length >> 1) + size;
      this.buffer = new Uint8Array(newSize);
      copy(oldBuffer, this.buffer);
    }
  }

  public addInt32(num: number): BufferWriter {
    this.ensure(4);
    this.buffer[this.offset++] = (num >>> 24) & 0xff;
    this.buffer[this.offset++] = (num >>> 16) & 0xff;
    this.buffer[this.offset++] = (num >>> 8) & 0xff;
    this.buffer[this.offset++] = (num >>> 0) & 0xff;
    return this;
  }

  public addInt16(num: number): BufferWriter {
    this.ensure(2);
    this.buffer[this.offset++] = (num >>> 8) & 0xff;
    this.buffer[this.offset++] = (num >>> 0) & 0xff;
    return this;
  }

  public addCString(string: string): BufferWriter {
    if (!string) {
      this.ensure(1);
    } else {
      const stringBuffer = this.encoder.encode(string);
      this.ensure(stringBuffer.byteLength + 1); // +1 for null terminator
      this.buffer.set(stringBuffer, this.offset);
      this.offset += stringBuffer.byteLength;
    }

    this.buffer[this.offset++] = 0; // null terminator
    return this;
  }

  public addString(string = ''): BufferWriter {
    const stringBuffer = this.encoder.encode(string);
    this.ensure(stringBuffer.byteLength);
    this.buffer.set(stringBuffer, this.offset);
    this.offset += stringBuffer.byteLength;
    return this;
  }

  public add(otherBuffer: Uint8Array): BufferWriter {
    this.ensure(otherBuffer.byteLength);
    copy(otherBuffer, this.buffer, this.offset);
    this.offset += otherBuffer.length;
    return this;
  }

  private join(code?: number) {
    if (code) {
      this.buffer[this.headerPosition] = code;
      // length is everything in this packet minus the code
      const length = this.offset - (this.headerPosition + 1);
      const dataView = new DataView(
        this.buffer.buffer,
        this.buffer.byteOffset,
        this.buffer.byteLength,
      );
      dataView.setInt32(this.headerPosition + 1, length);
    }
    return this.buffer.slice(code ? 0 : 5, this.offset);
  }

  public flush(code?: number) {
    const result = this.join(code);
    this.offset = 5;
    this.headerPosition = 0;
    this.buffer = new Uint8Array(this.size);
    return result;
  }
}
