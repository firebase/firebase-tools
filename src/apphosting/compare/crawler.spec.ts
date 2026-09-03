import { expect } from "chai";
import * as nock from "nock";
import { Crawler } from "./crawler";

describe("Crawler", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("should recursively crawl text/html links", async () => {
    const base = "https://example.com";

    nock(base)
      .get("/")
      .reply(
        200,
        `
        <html>
          <body>
            <a href="/about">About Us</a>
            <a href="https://example.com/contact">Contact Us</a>
            <a href="https://external.com">External Link</a>
          </body>
        </html>
      `,
        { "Content-Type": "text/html" },
      );

    nock(base)
      .get("/about")
      .reply(
        200,
        `
        <html>
          <body>
            <a href="/careers">Careers</a>
          </body>
        </html>
      `,
        { "Content-Type": "text/html" },
      );

    nock(base).get("/contact").reply(200, "Contact Details", { "Content-Type": "text/html" });

    nock(base).get("/careers").reply(200, "Join our team", { "Content-Type": "text/html" });

    const crawler = new Crawler(base);
    await crawler.crawl();

    const routes = crawler.getRoutes();
    expect(routes).to.deep.equal(["/", "/about", "/careers", "/contact"]);
  });

  it("should follow redirect links", async () => {
    const base = "https://example.com";

    nock(base)
      .get("/")
      .reply(200, `<a href="/old-link">Redirect me</a>`, { "Content-Type": "text/html" });

    nock(base).get("/old-link").reply(302, undefined, { Location: "/new-link" });

    nock(base).get("/new-link").reply(200, "Done!", { "Content-Type": "text/html" });

    const crawler = new Crawler(base);
    await crawler.crawl();

    const routes = crawler.getRoutes();
    expect(routes).to.deep.equal(["/", "/new-link", "/old-link"]);
  });

  it("should canonicalize paths and sort queries", async () => {
    const base = "https://example.com";
    const crawler = new Crawler(base);

    expect(crawler.canonicalizeRoute("/about/")).to.equal("/about");
    expect(crawler.canonicalizeRoute("/search?q=foo&a=bar")).to.equal("/search?a=bar&q=foo");
    expect(crawler.canonicalizeRoute("https://external.com/foo")).to.be.null;
  });
});
