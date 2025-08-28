import { promises as fs } from "fs";

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
