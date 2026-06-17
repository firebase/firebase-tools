import * as fs from "fs-extra";
import * as path from "path";
import { logger } from "../../logger";

/**
 * Discovers built routes in a project by checking Next.js manifests and local sitemaps.
 */
export async function discoverRoutes(appPath: string): Promise<string[]> {
  const routes = new Set<string>(["/"]);

  // 1. Next.js Manifest Parsing
  const nextDir = path.join(appPath, ".next");
  if (await fs.pathExists(nextDir)) {
    logger.info("Next.js build directory detected. Parsing manifests...");
    try {
      const prerenderManifestPath = path.join(nextDir, "prerender-manifest.json");
      if (await fs.pathExists(prerenderManifestPath)) {
        const prerender = await fs.readJson(prerenderManifestPath);
        if (prerender.routes) {
          for (const route of Object.keys(prerender.routes)) {
            routes.add(route);
          }
        }
      }

      const routesManifestPath = path.join(nextDir, "routes-manifest.json");
      if (await fs.pathExists(routesManifestPath)) {
        const manifests = await fs.readJson(routesManifestPath);
        if (manifests.staticRoutes) {
          for (const route of manifests.staticRoutes) {
            routes.add(route.page);
          }
        }
      }
    } catch (err) {
      logger.debug(`Error parsing Next.js manifests: ${err}`);
    }
  }

  // 2. Local Sitemap Parsing (Regex-based)
  const sitemapPaths = [
    path.join(appPath, "public", "sitemap.xml"),
    path.join(appPath, "sitemap.xml"),
    path.join(appPath, "dist", "sitemap.xml"),
  ];

  for (const sitemapPath of sitemapPaths) {
    if (await fs.pathExists(sitemapPath)) {
      logger.info(`Sitemap detected at ${sitemapPath}. Parsing...`);
      try {
        const xml = await fs.readFile(sitemapPath, "utf-8");
        const locMatches = xml.matchAll(/<loc>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/gi);
        for (const match of locMatches) {
          try {
            const url = new URL(match[1].trim());
            routes.add(url.pathname + url.search);
          } catch {
            // Ignore invalid URLs
          }
        }
      } catch (err) {
        logger.debug(`Error parsing sitemap ${sitemapPath}: ${err}`);
      }
    }
  }

  return Array.from(routes).sort();
}
