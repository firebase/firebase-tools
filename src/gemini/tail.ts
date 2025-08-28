import { promises as fs } from "fs";

/**
 * Reads the last N lines of a file in a memory-efficient way by reading chunks from the end.
 * @param filePath The path to the file.
 * @param maxLines The number of lines to read from the end of the file.
 * @returns A promise that resolves to an array of strings, each being a line from the file.
 */
export async function tail(filePath: string, maxLines: number): Promise<string[]> {
  let fileHandle;
  try {
    fileHandle = await fs.open(filePath, "r");
    const stats = await fileHandle.stat();
    const CHUNK_SIZE = 1024 * 64; // 64KB
    let filePos = stats.size;
    let buffer = Buffer.alloc(0);
    const lines: string[] = [];

    while (filePos > 0 && lines.length < maxLines) {
      const bytesToRead = Math.min(CHUNK_SIZE, filePos);
      const chunk = Buffer.alloc(bytesToRead);

      await fileHandle.read(chunk, 0, bytesToRead, filePos - bytesToRead);

      buffer = Buffer.concat([chunk, buffer]);
      filePos -= bytesToRead;

      let newlineIndex;
      while ((newlineIndex = buffer.lastIndexOf("\n")) !== -1) {
        const line = buffer.slice(newlineIndex + 1).toString("utf-8");
        lines.push(line);
        buffer = buffer.slice(0, newlineIndex);
        if (lines.length >= maxLines) {
          break;
        }
      }
    }

    if (buffer.length > 0 && lines.length < maxLines) {
      lines.push(buffer.toString("utf-8"));
    }

    return lines.reverse();
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return []; // File not found is not a fatal error
    }
    throw e;
  } finally {
    await fileHandle?.close();
  }
}
