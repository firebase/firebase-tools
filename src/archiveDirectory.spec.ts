import { resolve } from "path";
import * as fs from "fs";
import * as tmp from "tmp";
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

  it("should ignore symlinks", async () => {
    const dir = tmp.dirSync();
    fs.writeFileSync(resolve(dir.name, "file.txt"), "hello");
    fs.symlinkSync(resolve(dir.name, "file.txt"), resolve(dir.name, "link.txt"));

    const result = await archiveDirectory(dir.name, {});
    expect(result.manifest).to.include("file.txt");
    expect(result.manifest).to.not.include("link.txt");
  });
});
