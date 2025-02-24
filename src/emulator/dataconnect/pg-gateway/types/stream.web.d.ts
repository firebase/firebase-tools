declare module 'node:stream/web' {
  // Re-export web streams from global scope to fix minor type
  // mismatches between standard web streams and 'node:stream/web'
  export { ReadableStream, WritableStream };
}
