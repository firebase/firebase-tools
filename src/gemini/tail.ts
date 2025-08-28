import { promises as fs } from "fs";

/**
 * Reads the last N lines of a file.
 * @param filePath The path to the file.
 * @param numLines The number of lines to read from the end of the file.
 * @returns A promise that resolves to an array of strings, each being a line from the file.
 */
export async function tail(filePath: string, numLines: number): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, { encoding: "utf-8" });
    const lines = content.split("\n");
    return lines.slice(-numLines);
  } catch (e: any) {
    // If the file doesn't exist, it's not a fatal error. Return an empty array.
    if (e.code === "ENOENT") {
      return [];
    }
    // For other errors (e.g., permissions), re-throw.
    throw e;
  }
}
