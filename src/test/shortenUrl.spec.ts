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
import * as nock from "nock";
import { dynamicLinksKey, dynamicLinksOrigin } from "../api";
import { shortenUrl } from "../shortenUrl";

describe("shortenUrl", () => {
  const TEST_LINK = "https://abc.def/";
  const MOCKED_LINK = "https://firebase.tools/l/TEST";

  function mockDynamicLinks(url: string, suffix = "UNGUESSABLE", code = 200): void {
    nock(dynamicLinksOrigin)
      .post(
        `/v1/shortLinks`,
        (body: { dynamicLinkInfo?: { link: string }; suffix?: { option: string } }) =>
          body.dynamicLinkInfo?.link === url && body.suffix?.option === suffix
      )
      .query({ key: dynamicLinksKey })
      .reply(code, {
        shortLink: MOCKED_LINK,
        previewLink: `${MOCKED_LINK}?d=1`,
      });
  }

  it("should return a shortened url with an unguessable suffix by default", async () => {
    mockDynamicLinks(TEST_LINK);
    expect(await shortenUrl(TEST_LINK)).to.eq(MOCKED_LINK);
  });

  it("should request a short suffix URL if guessable is true", async () => {
    mockDynamicLinks(TEST_LINK, "SHORT");
    expect(await shortenUrl(TEST_LINK, true)).to.eq(MOCKED_LINK);
  });

  it("should return the original URL in case of an error", async () => {
    mockDynamicLinks(TEST_LINK, "UNGUESSABLE", 400);
    expect(await shortenUrl(TEST_LINK)).to.eq(TEST_LINK);
  });
});
