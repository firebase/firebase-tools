import { expect } from "chai";

import { SourceTokenScraper } from "../../../../deploy/functions/release/sourceTokenScraper";

describe("SourcTokenScraper", () => {
  it("immediately provides the first result", async () => {
    const scraper = new SourceTokenScraper();
    await expect(scraper.tokenPromise()).to.eventually.be.undefined;
  });

  it("provides results after the firt operation completes", async () => {
    const scraper = new SourceTokenScraper();
    // First result comes right away;
    await expect(scraper.tokenPromise()).to.eventually.be.undefined;

    let gotResult = false;
    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error("Timeout")), 10);
    });
    const getResult = (async () => {
      await scraper.tokenPromise();
      gotResult = true;
    })();
    await expect(Promise.race([getResult, timeout])).to.be.rejectedWith("Timeout");
    expect(gotResult).to.be.false;

    scraper.poller({ done: true });
    await expect(getResult).to.eventually.be.undefined;
  });

  it("provides tokens from an operation", async () => {
    const scraper = new SourceTokenScraper();
    // First result comes right away
    await expect(scraper.tokenPromise()).to.eventually.be.undefined;

    scraper.poller({
      metadata: {
        sourceToken: "magic token",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.tokenPromise()).to.eventually.equal("magic token");
  });
});
