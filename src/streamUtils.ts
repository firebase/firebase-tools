import { Readable } from "stream";

/**
 * Converts text input to a Readable stream.
 * @param text string to turn into a stream.
 * @return Readable stream, or undefined if text is empty.
 */
export function stringToStream(text: string): Readable | undefined {
  if (!text) {
    return undefined;
  }
  const s = new Readable();
  s.push(text);
  s.push(null);
  return s;
}

/**
 * Converts a Readable stream into a string.
 * @param s a readable stream.
 * @return a promise resolving to the string'd contents of the stream.
 */
export function streamToString(s?: NodeJS.ReadableStream | null): Promise<string> {
  if (!s) {
    return Promise.resolve("");
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    s.on("error", reject);
    s.on("data", (d: Buffer | string) => {
      // Buffer the raw chunks and decode once at the end. Decoding each chunk
      // on its own corrupts any multi-byte character that straddles a chunk
      // boundary, turning it into replacement characters.
      chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(String(d), "utf8"));
    });
    s.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
