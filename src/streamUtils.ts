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
export function streamToString(s: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let b = "";
    s.on("error", reject);
    s.on("data", (d: Buffer | string) => {
      b += d.toString();
    });
    s.once("end", () => resolve(b));
  });
}
