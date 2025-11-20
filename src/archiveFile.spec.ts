import * as fs from 'fs';
import { expect } from "chai";
import { archiveFile } from "./archiveFile";
import { FIXTURE_DIR } from "./test/fixtures/config-imports";

describe("archiveFile", () => {
  it("should archive files", async () => {
    const outputPath = await archiveFile(`${FIXTURE_DIR}/firebase.json`);

    expect(outputPath).to.match(/\.zip$/);
    expect(fs.existsSync(outputPath)).to.be.true;
    const archiveStats = fs.statSync(outputPath);
    const origStats = fs.statSync(`${FIXTURE_DIR}/firebase.json`);
    expect(archiveStats.size).to.be.greaterThan(0);
    expect(archiveStats.size).not.to.equal(origStats.size);
  });
});
