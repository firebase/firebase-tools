import * as fs from "fs-extra";
import * as path from "path";
import { logger } from "../../logger";

/**
 * Recursively scans a directory for files matching a pattern.
 */
async function scanDir(
  dir: string,
  fileCallback: (filePath: string) => void | Promise<void>,
): Promise<void> {
  if (!(await fs.pathExists(dir))) return;
  const files = await fs.readdir(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      if (
        file !== "node-modules" &&
        file !== "node_modules" &&
        file !== ".git" &&
        file !== ".next" &&
        file !== ".angular" &&
        file !== "dist"
      ) {
        await scanDir(fullPath, fileCallback);
      }
    } else {
      await fileCallback(fullPath);
    }
  }
}

/**
 * Discovers Next.js source routes from src/app, app, src/pages, or pages directory
 */
export async function discoverSourceRoutes(appPath: string): Promise<string[]> {
  const routes = new Set<string>();

  // Check App Router (src/app or app)
  const appDirs = [path.join(appPath, "src", "app"), path.join(appPath, "app")];
  for (const appDir of appDirs) {
    if (await fs.pathExists(appDir)) {
      await scanDir(appDir, (filePath) => {
        const base = path.basename(filePath);
        if (/^(page|route)\.[jt]sx?$/.test(base)) {
          const relDir = path.relative(appDir, path.dirname(filePath));
          let route = relDir ? "/" + relDir : "/";
          // Normalize dynamic params: [id] -> 1, [...catchall] -> 1
          route = route.replace(/\[\.\.\.[^\]]+\]/g, "1");
          route = route.replace(/\[[^\]]+\]/g, "1");
          // Remove Next.js route groups like (marketing)
          route = route.replace(/\/\([^)]+\)/g, "");
          routes.add(route === "" ? "/" : route);
        }
      });
    }
  }

  // Check Pages Router (src/pages or pages)
  const pagesDirs = [path.join(appPath, "src", "pages"), path.join(appPath, "pages")];
  for (const pagesDir of pagesDirs) {
    if (await fs.pathExists(pagesDir)) {
      await scanDir(pagesDir, (filePath) => {
        const ext = path.extname(filePath);
        if ([".js", ".jsx", ".ts", ".tsx"].includes(ext)) {
          const base = path.basename(filePath, ext);
          if (["_app", "_document", "_error", "api"].includes(base) || filePath.includes("/api/")) {
            return;
          }
          const relPath = path.relative(pagesDir, filePath);
          let route = "/" + relPath.substring(0, relPath.length - ext.length);
          if (route.endsWith("/index")) {
            route = route.substring(0, route.length - 6);
          }
          // Normalize dynamic parameters
          route = route.replace(/\[\.\.\.[^\]]+\]/g, "1");
          route = route.replace(/\[[^\]]+\]/g, "1");
          routes.add(route === "" ? "/" : route);
        }
      });
    }
  }

  return Array.from(routes);
}

/**
 * Scans source TS files for Angular style route paths like `path: 'about'`
 */
export async function discoverAngularRoutes(appPath: string): Promise<string[]> {
  const routes = new Set<string>();
  const srcDir = path.join(appPath, "src");
  if (await fs.pathExists(srcDir)) {
    await scanDir(srcDir, async (filePath) => {
      if (filePath.endsWith(".ts") && !filePath.endsWith(".spec.ts")) {
        try {
          const content = await fs.readFile(filePath, "utf-8");
          // Match path: 'about' or path: "about"
          const pathRegex = /path\s*:\s*(['"])(.*?)\1/g;
          let match;
          while ((match = pathRegex.exec(content)) !== null) {
            const val = match[2].trim();
            // Skip wildcards and dynamic parameter placeholders
            if (val && !val.includes("**") && !val.startsWith(":") && !val.includes("/")) {
              routes.add("/" + val);
            }
          }
        } catch {
          // Ignore read errors
        }
      }
    });
  }
  return Array.from(routes);
}

/**
 * Discovers built routes in a project by checking Next.js manifests, source pages, and sitemaps.
 */
export async function discoverRoutes(appPath: string): Promise<string[]> {
  const routes = new Set<string>(["/"]);

  // 1. Next.js Manifest Parsing (Local Build Output)
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

  // 2. Next.js Source Tree Traversal
  try {
    const srcRoutes = await discoverSourceRoutes(appPath);
    for (const r of srcRoutes) {
      routes.add(r);
    }
  } catch (err) {
    logger.debug(`Error scanning Next.js source routes: ${err}`);
  }

  // 3. Angular Routing Scanner
  try {
    const angularRoutes = await discoverAngularRoutes(appPath);
    for (const r of angularRoutes) {
      routes.add(r);
    }
  } catch (err) {
    logger.debug(`Error scanning Angular source routes: ${err}`);
  }

  // 4. Local Sitemap Parsing
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
