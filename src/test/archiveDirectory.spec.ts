import { resolve } from "path";
import { expect } from "chai";
import { FirebaseError } from "../error";

import { archiveDirectory } from "../archiveDirectory";

const SOME_FIXTURE_DIRECTORY = resolve(__dirname, "./fixtures/config-imports");

describe("archiveDirectory", () => {
  it("should archive happy little directories", async () => {
    const result = await archiveDirectory(SOME_FIXTURE_DIRECTORY, {});
    expect(result.source).to.equal(SOME_FIXTURE_DIRECTORY);
    expect(result.size).to.be.greaterThan(0);
  });

  it("should throw a happy little error if the directory doesn't exist", async () => {
    await expect(archiveDirectory(resolve(__dirname, "foo"), {})).to.be.rejectedWith(FirebaseError);
  });
});
