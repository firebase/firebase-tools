import { expect } from "chai";

import { SourceTokenScraper } from "./sourceTokenScraper";

describe("SourceTokenScraper", () => {
  it("immediately provides the first result", async () => {
    const scraper = new SourceTokenScraper();
    await expect(scraper.withToken((getToken) => getToken())).to.eventually.be.undefined;
  });

  it("provides results after the first operation completes", async () => {
    const scraper = new SourceTokenScraper();
    // First result comes right away;
    await expect(scraper.withToken((getToken) => getToken())).to.eventually.be.undefined;

    let gotResult = false;
    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error("Timeout")), 10);
    });
    const getResult = scraper.withToken(async (getToken) => {
      gotResult = true;
      return getToken();
    });
    await expect(Promise.race([getResult, timeout])).to.be.rejectedWith("Timeout");
    expect(gotResult).to.be.false;

    scraper.poller({ done: true });
    await expect(getResult).to.eventually.be.undefined;
  });

  it("provides tokens from an operation", async () => {
    const scraper = new SourceTokenScraper();
    // First result comes right away
    await expect(scraper.withToken((getToken) => getToken())).to.eventually.be.undefined;

    scraper.poller({
      metadata: {
        sourceToken: "magic token",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.withToken((getToken) => getToken())).to.eventually.equal("magic token");
  });

  it("refreshes token after timer expires", async () => {
    const scraper = new SourceTokenScraper(10);
    await expect(scraper.withToken((getToken) => getToken())).to.eventually.be.undefined;
    scraper.poller({
      metadata: {
        sourceToken: "magic token",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.withToken((getToken) => getToken())).to.eventually.equal("magic token");
    const timeout = (duration: number): Promise<void> => {
      return new Promise<void>((resolve) => setTimeout(resolve, duration));
    };
    await timeout(50);
    await expect(scraper.withToken((getToken) => getToken())).to.eventually.be.undefined;
    scraper.poller({
      metadata: {
        sourceToken: "magic token #2",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.withToken((getToken) => getToken())).to.eventually.equal("magic token #2");
  });

  it("tries to fetch a new source token upon abort", async () => {
    const scraper = new SourceTokenScraper();
    await expect(
      scraper.withToken(async () => {
        throw new Error("Failed deploy");
      }),
    ).to.be.rejectedWith("Failed deploy");

    await expect(scraper.withToken((getToken) => getToken())).to.eventually.be.undefined;
    scraper.poller({
      metadata: {
        sourceToken: "magic token",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.withToken((getToken) => getToken())).to.eventually.equal("magic token");
  });

  it("concurrent requests for source token", async () => {
    const scraper = new SourceTokenScraper();

    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(scraper.withToken((getToken) => getToken()));
    }
    scraper.poller({
      metadata: {
        sourceToken: "magic token",
        target: "projects/p/locations/l/functions/f",
      },
    });

    let successes = 0;
    const tokens = await Promise.all(promises);
    for (const tok of tokens) {
      if (tok === "magic token") {
        successes++;
      }
    }
    expect(tokens.includes(undefined)).to.be.true;
    expect(successes).to.equal(2);
  });

  it("unblocks waiting callers on abort and allows subsequent fetches", async () => {
    const scraper = new SourceTokenScraper();

    // First caller starts fetching and will fail asynchronously
    let failFirst!: (err: Error) => void;
    let firstOp!: Promise<unknown>;
    const firstOpStarted = new Promise<void>((ready) => {
      firstOp = scraper.withToken(async (getToken) => {
        await getToken();
        return new Promise((_, reject) => {
          failFirst = reject;
          ready();
        });
      });
    });
    await firstOpStarted;

    // Two callers start waiting for the token
    const waiting1 = scraper.withToken((getToken) => getToken());
    const waiting2 = scraper.withToken((getToken) => getToken());

    // Fail the ongoing operation, triggering abort
    failFirst(new Error("Deploy failed"));
    await expect(firstOp).to.be.rejectedWith("Deploy failed");

    // Both waiting callers should receive undefined and not hang
    const [res1, res2] = await Promise.all([waiting1, waiting2]);
    expect(res1).to.be.undefined;
    expect(res2).to.be.undefined;

    // A subsequent caller (or retrying task) should be able to initiate a new fetch
    const retryToken = await scraper.withToken((getToken) => getToken());
    expect(retryToken).to.be.undefined;

    // And subsequent waiters get the token once poller completes
    const waiterAfterRetry = scraper.withToken((getToken) => getToken());
    scraper.poller({
      metadata: {
        sourceToken: "new token",
        target: "projects/p/locations/l/functions/f",
      },
    });
    expect(await waiterAfterRetry).to.equal("new token");
  });

  it("withToken returns operation result on success", async () => {
    const scraper = new SourceTokenScraper();
    const result = await scraper.withToken(async (getToken) => {
      expect(await getToken()).to.be.undefined;
      return "success";
    });
    expect(result).to.equal("success");
  });

  it("withToken automatically aborts when operation throws", async () => {
    const scraper = new SourceTokenScraper();

    // First caller starts withToken and fails
    const failedOp = scraper.withToken(async () => {
      throw new Error("Deploy failed");
    });

    await expect(failedOp).to.be.rejectedWith("Deploy failed");

    // A subsequent caller should be able to initiate a new fetch without deadlock
    const nextResult = await scraper.withToken(async (getToken) => {
      expect(await getToken()).to.be.undefined;
      return "recovered";
    });
    expect(nextResult).to.equal("recovered");
  });

  it("handles concurrent callers when an existing token has expired without hanging waiters", async () => {
    const scraper = new SourceTokenScraper(10);

    await expect(scraper.withToken((getToken) => getToken())).to.eventually.be.undefined;
    scraper.poller({
      metadata: {
        sourceToken: "initial-token",
        target: "projects/p/locations/us-central1/functions/f1",
      },
    });
    await expect(scraper.withToken((getToken) => getToken())).to.eventually.equal("initial-token");

    await new Promise<void>((resolve) => setTimeout(resolve, 30));

    // Launch 3 concurrent calls after token expiry; only the first should fetch (receiving undefined),
    // while the other 2 wait for the refreshed token without overwriting this.promise.
    const expiredCalls = [
      scraper.withToken(async (getToken) => {
        const t = await getToken();
        if (t === undefined) {
          scraper.poller({
            metadata: {
              sourceToken: "refreshed-token",
              target: "projects/p/locations/us-central1/functions/f2",
            },
          });
        }
        return t;
      }),
      scraper.withToken((getToken) => getToken()),
      scraper.withToken((getToken) => getToken()),
    ];

    const results = await Promise.all(expiredCalls);
    expect(results).to.deep.equal([undefined, "refreshed-token", "refreshed-token"]);
  });

  it("makes a caller already inside withToken wait for an in-flight refresh", async () => {
    const scraper = new SourceTokenScraper(50);
    await scraper.withToken((getToken) => getToken());
    scraper.poller({
      metadata: {
        sourceToken: "initial-token",
        target: "projects/p/locations/us-central1/functions/f1",
      },
    });

    // The peer enters withToken while the token is valid and retries after it expires.
    let peerRetry!: () => Promise<string | undefined>;
    let finishPeer!: () => void;
    const peerDone = new Promise<void>((resolve) => (finishPeer = resolve));
    const peer = scraper.withToken(async (getToken) => {
      expect(await getToken()).to.equal("initial-token");
      peerRetry = getToken;
      await peerDone;
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    await scraper.withToken(async (getToken) => {
      expect(await getToken()).to.be.undefined; // expired, so this caller refreshes it
      const peerToken = peerRetry();
      scraper.poller({
        metadata: {
          sourceToken: "refreshed-token",
          target: "projects/p/locations/us-central1/functions/f2",
        },
      });
      expect(await peerToken).to.equal("refreshed-token");
    });
    finishPeer();
    await peer;
  });

  it("does not abort another caller's fetch when a caller fails", async () => {
    const scraper = new SourceTokenScraper();
    // The bystander is already inside withToken when the fetch starts.
    let failBystander!: (err: Error) => void;
    const bystander = scraper.withToken(
      () => new Promise<never>((_, reject) => (failBystander = reject)),
    );
    await expect(scraper.withToken((getToken) => getToken())).to.eventually.be.undefined;
    const waiter = scraper.withToken((getToken) => getToken());

    failBystander(new Error("bystander failed"));
    await expect(bystander).to.be.rejectedWith("bystander failed");
    scraper.poller({
      metadata: {
        sourceToken: "fetched-token",
        target: "projects/p/locations/us-central1/functions/f1",
      },
    });

    expect(await waiter).to.equal("fetched-token");
  });

  it("keeps waiters blocked when the fetcher's operation fails without a token", async () => {
    const scraper = new SourceTokenScraper();
    const fetcherTokens: Array<string | undefined> = [];
    let waiterResolved = false;
    let retryFetcher!: () => void;
    const retried = new Promise<void>((resolve) => (retryFetcher = resolve));

    const fetcher = scraper.withToken(async (getToken) => {
      fetcherTokens.push(await getToken());
      // The operation finishes with an error before any build produced a token.
      scraper.poller({ done: true, error: { code: 8, message: "quota exhausted" } });
      await retried;
      // Retry: still the fetcher, so it builds from source again.
      fetcherTokens.push(await getToken());
      scraper.poller({
        metadata: {
          sourceToken: "retry-token",
          target: "projects/p/locations/us-central1/functions/f1",
        },
      });
    });
    const waiter = scraper
      .withToken((getToken) => getToken())
      .then((token) => {
        waiterResolved = true;
        return token;
      });

    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    expect(waiterResolved).to.be.false;

    retryFetcher();
    await fetcher;
    expect(await waiter).to.equal("retry-token");
    expect(fetcherTokens).to.deep.equal([undefined, undefined]);
  });

  it("releases waiters when the fetcher's operation succeeds without a token", async () => {
    const scraper = new SourceTokenScraper();
    const fetcher = scraper.withToken(async (getToken) => {
      await getToken();
      scraper.poller({ done: true });
    });
    const waiter = scraper.withToken((getToken) => getToken());

    await fetcher;
    expect(await waiter).to.be.undefined;
  });
});
