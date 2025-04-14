import { resolve } from "path";
import { expect } from "chai";
import { FirebaseError } from "./error";

import { archiveDirectory } from "./archiveDirectory";
import { FIXTURE_DIR } from "./test/fixtures/config-imports";

describe("archiveDirectory", () => {
  it("should archive happy little directories", async () => {
    const result = await archiveDirectory(FIXTURE_DIR, {});
    expect(result.source).to.equal(FIXTURE_DIR);
    expect(result.size).to.be.greaterThan(0);
  });

  it("should throw a happy little error if the directory doesn't exist", async () => {
    await expect(archiveDirectory(resolve(__dirname, "foo"), {})).to.be.rejectedWith(FirebaseError);
  });
});
