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
 *  - https://github.com/googleapis/nodejs-storage/blob/0c1fa3934a52a608366a8c6c798c43516dd03dbf/src/file.ts#L1406-L1409
 */
export function crc32cToString(crc32cValue: number | string): string {
  // Does the reverse of https://stackoverflow.com/q/25096737/849645
  return "----" + Buffer.from([crc32cValue]).toString("base64");
}
