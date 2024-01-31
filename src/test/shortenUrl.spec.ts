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
          body.dynamicLinkInfo?.link === url && body.suffix?.option === suffix,
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
