import fetch from "node-fetch";

function decodeHtmlEntities(str: string): string {
  const entities: Record<string, string> = {
    "amp": "&",
    "lt": "<",
    "gt": ">",
    "quot": '"',
    "#39": "'"
  };
  return str.replace(/&(amp|lt|gt|quot|#39);/gi, (match, entity) => {
    return entities[entity.toLowerCase()] || match;
  });
}

interface Destroyable {
  destroy(): void;
}

function isDestroyable(obj: unknown): obj is Destroyable {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "destroy" in obj &&
    typeof (obj as Record<string, unknown>).destroy === "function"
  );
}

export class Crawler {
  private visited = new Set<string>();
  private discoveredRoutes = new Set<string>();

  constructor(
    private readonly baseUrl: string,
    private readonly maxDepth = 3,
  ) {}

  public getRoutes(): string[] {
    return Array.from(this.discoveredRoutes).sort();
  }

  /**
   * Crawls starting from root and recursively finds links.
   */
  public async crawl(): Promise<void> {
    await this.crawlRoute("/");
  }

  private async crawlRoute(route: string, depth = 0): Promise<void> {
    const canonical = this.canonicalizeRoute(route);
    if (!canonical || this.visited.has(canonical) || depth > this.maxDepth) {
      return;
    }

    this.visited.add(canonical);
    this.discoveredRoutes.add(canonical);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const url = `${this.baseUrl}${canonical}`;
      const res = await fetch(url, {
        redirect: "manual" as const,
        headers: { "User-Agent": "FirebaseCompareCrawler/1.0" },
        signal: controller.signal,
        size: 2 * 1024 * 1024,
      });

      // Handle Redirects
      if ([301, 302, 307, 308].includes(res.status)) {
        if (res.body && isDestroyable(res.body)) {
          res.body.destroy();
        }
        const location = res.headers.get("location");
        if (location) {
          const nextRoute = this.resolveRelative(canonical, location);
          if (nextRoute) {
            await this.crawlRoute(nextRoute, depth + 1);
          }
        }
        return;
      }

      // Only parse HTML responses
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("text/html")) {
        if (res.body && isDestroyable(res.body)) {
          res.body.destroy();
        }
        return;
      }

      const html = await res.text();
      const links = this.extractLinks(html, canonical);

      await Promise.all(links.map((link) => this.crawlRoute(link, depth + 1)));
    } catch (err) {
      // Ignore fetch failures for single routes during discovery
    } finally {
      clearTimeout(timeout);
    }
  }

  public canonicalizeRoute(route: string): string | null {
    try {
      const url = new URL(route, this.baseUrl);
      if (url.origin !== new URL(this.baseUrl).origin) {
        return null;
      }

      let pathname = url.pathname;
      if (pathname.endsWith("/") && pathname.length > 1) {
        pathname = pathname.slice(0, -1);
      }

      const params = Array.from(url.searchParams.entries()).sort((a, b) =>
        a[0].localeCompare(b[0]),
      );
      const search = params.length > 0 ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&") : "";

      return `${pathname}${search}`;
    } catch {
      return null;
    }
  }

  private extractLinks(html: string, currentRoute: string): string[] {
    const links: string[] = [];
    const regex = /<a\s+(?:[^>]*?\s+)?href\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
      const rawHref = match[2] !== undefined ? match[2] : match[3];
      if (!rawHref) continue;

      const href = decodeHtmlEntities(rawHref.trim());
      if (!href || href.startsWith("#")) {
        continue;
      }

      const schemeMatch = href.match(/^[a-z][a-z0-9+.-]*:/i);
      if (schemeMatch) {
        const scheme = schemeMatch[0].toLowerCase();
        if (scheme !== "http:" && scheme !== "https:") {
          continue;
        }
      }

      const resolved = this.resolveRelative(currentRoute, href);
      if (resolved) {
        links.push(resolved);
      }
    }

    return links;
  }

  private resolveRelative(currentRoute: string, href: string): string | null {
    try {
      const base = new URL(currentRoute, this.baseUrl);
      const resolved = new URL(href, base.href);
      if (resolved.origin !== new URL(this.baseUrl).origin) {
        return null;
      }
      return resolved.pathname + resolved.search;
    } catch {
      return null;
    }
  }
}

