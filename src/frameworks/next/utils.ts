import { existsSync } from "fs";
import { join } from "path";
import { readJSON } from "fs-extra";
import type { ExportMarker, ImageManifest } from "./interfaces";

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

/**
 * Check if Next.js is forced to serve the source image as-is instead of being oprimized
 * by setting `unoptimized: true` in next.config.js.
 * https://nextjs.org/docs/api-reference/next/image#unoptimized
 *
 * @param sourceDir location of the source directory
 * @param distDir location of the dist directory
 * @return true if image optimization is disabled
 */
export async function hasUnoptimizedImage(sourceDir: string, distDir: string): Promise<boolean> {
  const imageManifest: ImageManifest = (await readJSON(
    join(sourceDir, distDir, "images-manifest.json")
  )) as ImageManifest;

  return imageManifest.images.unoptimized;
}
