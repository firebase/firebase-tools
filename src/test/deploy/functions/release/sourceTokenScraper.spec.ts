import { expect } from "chai";

import { SourceTokenScraper } from "../../../../deploy/functions/release/sourceTokenScraper";

describe("SourceTokenScraper", () => {
  it("immediately provides the first result", async () => {
    const scraper = new SourceTokenScraper();
    await expect(scraper.tokenPromise()).to.eventually.be.undefined;
  });

  it("provides results after the first operation completes", async () => {
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

  it.only("refreshes token after timer expires", async () => {
    const scraper = new SourceTokenScraper(100); // tokens expire every 100 ms
    // First result comes right away;
    await expect(scraper.tokenPromise()).to.eventually.be.undefined;

    const op = {
      metadata: {
        sourceToken: "magic token",
        target: "projects/p/locations/l/functions/f",
      },
    };
    scraper.poller(op);

    await expect(scraper.tokenPromise()).to.eventually.be.equal("magic token");
    const timeout = (): Promise<void> => {
      return new Promise<void>((resolve) => setTimeout(resolve, 200));
    };
    await timeout();
    scraper.poller(op); // sets token promise to undefined
    await expect(scraper.tokenPromise()).to.eventually.be.undefined;

    // new token polled
    scraper.poller({
      metadata: {
        sourceToken: "magic token 2",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.tokenPromise()).to.eventually.be.equal("magic token 2");
  });
});
