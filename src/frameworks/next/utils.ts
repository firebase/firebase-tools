import { existsSync } from "fs";
import { join } from "path";
import { readJSON } from "fs-extra";
import type { ExportMarker } from "./types";

/**
 * Check if `/app` directory is used in the Next.js project.
 * @param sourceDir location of the source directory
 * @return true if app directory is used in the Next.js project
 */
export function usesAppDirRouter(sourceDir: string): boolean {
  return existsSync(join(sourceDir, "app")) ? true : false;
}
/**
 * Check if the project is using the next/image component based on the export-marker.json file.
 * @param sourceDir location of the source directory
 * @return true if the Next.js project uses the next/image component
 */
export async function usesNextImage(sourceDir: string, distDir: string): Promise<boolean> {
  const exportMarker: ExportMarker = (await readJSON(
    join(sourceDir, distDir, "export-marker.json")
  )) as ExportMarker;
  return exportMarker.isNextImageImported;
}
