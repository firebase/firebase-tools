import { expect } from "chai";
import * as fs from "fs-extra";
import * as path from "path";
import { discoverRoutes } from "./discover";

describe("discoverRoutes", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), "scratch-test-discover-" + Math.random().toString(36).substring(7));
    fs.ensureDirSync(tempDir);
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it("should return root route by default if no manifests exist", async () => {
    const routes = await discoverRoutes(tempDir);
    expect(routes).to.deep.equal(["/"]);
  });

  it("should discover routes from Next.js manifests", async () => {
    const nextDir = path.join(tempDir, ".next");
    fs.ensureDirSync(nextDir);

    fs.writeJsonSync(path.join(nextDir, "prerender-manifest.json"), {
      routes: {
        "/about": {},
        "/blog/post-1": {}
      }
    });

    fs.writeJsonSync(path.join(nextDir, "routes-manifest.json"), {
      staticRoutes: [
        { page: "/" },
        { page: "/contact" }
      ]
    });

    const routes = await discoverRoutes(tempDir);
    expect(routes).to.deep.equal(["/", "/about", "/blog/post-1", "/contact"]);
  });

  it("should discover routes from sitemap.xml", async () => {
    const xml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://example.com/</loc>
        </url>
        <url>
          <loc>https://example.com/products?id=12</loc>
        </url>
      </urlset>
    `;
    fs.writeFileSync(path.join(tempDir, "sitemap.xml"), xml, "utf-8");

    const routes = await discoverRoutes(tempDir);
    expect(routes).to.deep.equal(["/", "/products?id=12"]);
  });
});
