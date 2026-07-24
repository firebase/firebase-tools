import { expect } from "chai";
import * as fs from "fs-extra";
import * as path from "path";
import { discoverRoutes } from "./discover";

describe("discoverRoutes", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(
      process.cwd(),
      "scratch-test-discover-" + Math.random().toString(36).substring(7),
    );
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
        "/blog/post-1": {},
      },
    });

    fs.writeJsonSync(path.join(nextDir, "routes-manifest.json"), {
      staticRoutes: [{ page: "/" }, { page: "/contact" }],
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

  it("should discover routes from Next.js source app directory structure", async () => {
    const appDir = path.join(tempDir, "src", "app");
    fs.ensureDirSync(path.join(appDir, "about"));
    fs.ensureDirSync(path.join(appDir, "dashboard", "settings"));
    fs.ensureDirSync(path.join(appDir, "blog", "[id]"));
    fs.ensureDirSync(path.join(appDir, "(marketing)", "pricing"));

    fs.writeFileSync(path.join(appDir, "page.tsx"), "export default function P() {}");
    fs.writeFileSync(path.join(appDir, "about", "page.tsx"), "export default function P() {}");
    fs.writeFileSync(path.join(appDir, "dashboard", "settings", "page.tsx"), "export default function P() {}");
    fs.writeFileSync(path.join(appDir, "blog", "[id]", "page.tsx"), "export default function P() {}");
    fs.writeFileSync(path.join(appDir, "(marketing)", "pricing", "page.tsx"), "export default function P() {}");

    const routes = await discoverRoutes(tempDir);
    expect(routes).to.deep.equal(["/", "/about", "/blog/1", "/dashboard/settings", "/pricing"]);
  });

  it("should discover routes from Angular source TS routing modules", async () => {
    const srcDir = path.join(tempDir, "src");
    fs.ensureDirSync(srcDir);

    const routingCode = `
      const routes: Routes = [
        { path: '', component: HomeComponent },
        { path: 'products', component: ProductsComponent },
        { path: 'user-profile', component: ProfileComponent },
        { path: '**', redirectTo: '' }
      ];
    `;
    fs.writeFileSync(path.join(srcDir, "app-routing.module.ts"), routingCode, "utf-8");

    const routes = await discoverRoutes(tempDir);
    expect(routes).to.deep.equal(["/", "/products", "/user-profile"]);
  });
});
