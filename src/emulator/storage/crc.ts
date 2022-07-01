/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * Function to compute a CRC table rather than store a massive literal in source.
 * Executed once.
 */
function makeCRCTable(poly: number) {
  let c;
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? poly ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }
  return crcTable;
}

/**
 * Each CRC algorithm has a different "polynomial":
 *   CRC32 - 0xEDB88320
 *   CRC32C - 0x82F63B78
 *
 * See: https://en.wikipedia.org/wiki/Cyclic_redundancy_check#Polynomial_representations_of_cyclic_redundancy_checks
 */
const CRC32C_TABLE = makeCRCTable(0x82f63b78);

/**
 * Adapted from:
 *  - https://en.wikipedia.org/wiki/Cyclic_redundancy_check#Computation
 *  - https://stackoverflow.com/a/18639999/324977
 *
 * @returns CRC32C as an unsigned 32-bit integer
 */
export function crc32c(bytes: Buffer): number {
  let crc = 0 ^ -1;

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    const nLookupIndex = (crc ^ byte) & 0xff;
    crc = (crc >>> 8) ^ CRC32C_TABLE[nLookupIndex];
  }

  return (crc ^ -1) >>> 0;
}

/**
 * Adapted from:
 *  - https://github.com/googleapis/nodejs-storage/blob/1d7d075b82fd24ea3c214bd304cefe4ba5d8be5c/src/crc32c.ts
 */
export function crc32cToString(crc32cValue: number | string): string {
  const value = typeof crc32cValue === "string" ? Number.parseInt(crc32cValue) : crc32cValue;

  // `Buffer` objects are arrays of 8-bit unsigned integers
  // Allocating 4 octets to write an unsigned CRC32C 32-bit integer
  const buffer = Buffer.alloc(4);
  buffer.writeUint32BE(value);

  return buffer.toString("base64");
}
