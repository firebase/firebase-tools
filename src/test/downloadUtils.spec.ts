import { expect } from "chai";
import { readFileSync } from "fs-extra";
import * as nock from "nock";
import { gunzipSync, gzipSync } from "zlib";

import { downloadToTmp } from "../downloadUtils";
import { FirebaseError } from "../error";

describe("downloadToTmp", () => {
  it("should download a file", async () => {
    const content = "hello world";
    const gzipContent = gzipSync(content);

    nock("https://example.com").get("/foo.gzip").reply(200, gzipContent);

    const fName = await downloadToTmp("https://example.com/foo.gzip");
    const fileContent = readFileSync(fName);
    const gunzipFileContent = gunzipSync(fileContent).toString("utf-8");

    expect(gunzipFileContent).to.equal(content);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw an error on non-200 code", async () => {
    nock("https://example.com").get("/foo.gzip").reply(404, "Not Found");

    await expect(downloadToTmp("https://example.com/foo.gzip")).to.eventually.be.rejectedWith(
      FirebaseError,
      /Not Found/,
    );

    expect(nock.isDone()).to.be.true;
  });
});
