import { expect } from "chai";
import * as nock from "nock";
import { compareRoute } from "./compare";

describe("compareRoute", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("should match identical text pages", async () => {
    nock("https://backend-a.com").get("/").reply(200, "hello world", {
      "Content-Type": "text/html",
      "Cache-Control": "public, max-age=3600"
    });
    nock("https://backend-b.com").get("/").reply(200, "hello world", {
      "Content-Type": "text/html",
      "Cache-Control": "public, max-age=3600"
    });

    const res = await compareRoute("/", "https://backend-a.com", "https://backend-b.com");
    expect(res.statusMatch).to.be.true;
    expect(res.headerMismatches).to.be.empty;
    expect(res.bodySimilarity).to.equal(1.0);
    expect(res.isBinary).to.be.false;
  });

  it("should flag status mismatches", async () => {
    nock("https://backend-a.com").get("/").reply(200, "ok");
    nock("https://backend-b.com").get("/").reply(404, "not found");

    const res = await compareRoute("/", "https://backend-a.com", "https://backend-b.com");
    expect(res.statusMatch).to.be.false;
  });

  it("should flag behavioral header mismatches but record dynamic ones as expected variations", async () => {
    nock("https://backend-a.com").get("/").reply(200, "ok", {
      "Cache-Control": "public, max-age=3600",
      "Date": "Wed, 17 Jun 2026 01:00:00 GMT"
    });
    nock("https://backend-b.com").get("/").reply(200, "ok", {
      "Cache-Control": "no-cache",
      "Date": "Wed, 17 Jun 2026 01:05:00 GMT"
    });

    const res = await compareRoute("/", "https://backend-a.com", "https://backend-b.com");
    expect(res.headerMismatches).to.have.lengthOf(1);
    expect(res.headerMismatches[0].header.toLowerCase()).to.equal("cache-control");
    
    expect(res.expectedHeaderVariations).to.have.lengthOf(1);
    expect(res.expectedHeaderVariations[0].header.toLowerCase()).to.equal("date");
  });

  it("should match identical binary pages and flag mismatching binary content", async () => {
    const binA = Buffer.from([1, 2, 3, 4]);
    const binB = Buffer.from([1, 2, 3, 4]);
    const binC = Buffer.from([1, 2, 3, 5]);

    nock("https://backend-a.com").get("/img.png").reply(200, binA, {
      "Content-Type": "image/png"
    });
    nock("https://backend-b.com").get("/img.png").reply(200, binB, {
      "Content-Type": "image/png"
    });

    const resMatch = await compareRoute("/img.png", "https://backend-a.com", "https://backend-b.com");
    expect(resMatch.isBinary).to.be.true;
    expect(resMatch.bodySimilarity).to.equal(1.0);

    nock("https://backend-a.com").get("/img.png").reply(200, binA, {
      "Content-Type": "image/png"
    });
    nock("https://backend-b.com").get("/img.png").reply(200, binC, {
      "Content-Type": "image/png"
    });

    const resMismatch = await compareRoute("/img.png", "https://backend-a.com", "https://backend-b.com");
    expect(resMismatch.isBinary).to.be.true;
    expect(resMismatch.bodySimilarity).to.equal(0.0);
  });
});
