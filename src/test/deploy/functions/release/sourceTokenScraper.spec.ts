/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
