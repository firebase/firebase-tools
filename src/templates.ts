import { readFileSync } from "fs";
import { readFile } from "fs/promises";
import { resolve } from "path";

const TEMPLATE_ROOT = resolve(__dirname, "../templates/");
const TEMPLATE_ENCODING = "utf8";

/**
 * Get an absolute template file path. (Prefer readTemplateSync instead.)
 * @param relPath file path relative to the /templates directory under root.
 */
export function absoluteTemplateFilePath(relPath: string): string {
  return resolve(TEMPLATE_ROOT, relPath);
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
