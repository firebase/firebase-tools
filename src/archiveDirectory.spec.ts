import { resolve } from "path";
import { expect } from "chai";
import { FirebaseError } from "./error.js";

import { archiveDirectory } from "./archiveDirectory.js";
import { FIXTURE_DIR } from "./test/fixtures/config-imports/index.js";

describe("archiveDirectory", () => {
  it("should archive happy little directories", async () => {
    const result = await archiveDirectory(FIXTURE_DIR, {});
    expect(result.source).to.equal(FIXTURE_DIR);
    expect(result.size).to.be.greaterThan(0);
  });

  it("should throw a happy little error if the directory doesn't exist", async () => {
    await expect(archiveDirectory(resolve("a/fake/path/foo"), {})).to.be.rejectedWith(FirebaseError);
  });
});
