import { readFileSync } from "fs";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { isVSCodeExtension } from "./vsCodeUtils";

const TEMPLATE_ENCODING = "utf8";

/**
 * Get an absolute template file path. (Prefer readTemplateSync instead.)
 * @param relPath file path relative to the /templates directory under root.
 */
export function absoluteTemplateFilePath(relPath: string): string {
  if (isVSCodeExtension()) {
    // In the VSCE, the /templates directory is copied into dist, which makes it
    // right next to the compiled files (from various sources including this
    // TS file). See CopyPlugin in `../firebase-vscode/webpack.common.js`.
    return resolve(__dirname, "templates", relPath);
  }
  // Otherwise, the /templates directory is one level above /src or /lib.
  return resolve(__dirname, "../templates", relPath);
}

/**
 * Read a template file synchronously.
 * @param relPath file path relative to the /templates directory under root.
 */
export function readTemplateSync(relPath: string): string {
  return readFileSync(absoluteTemplateFilePath(relPath), TEMPLATE_ENCODING);
}

/**
 * Read a template file asynchronously.
 * @param relPath file path relative to the /templates directory under root.
 */
export function readTemplate(relPath: string): Promise<string> {
  return readFile(absoluteTemplateFilePath(relPath), TEMPLATE_ENCODING);
}
