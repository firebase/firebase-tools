import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { detectAndAdaptExtension } from "./extensionAdapter";

describe("extensionAdapter golden tests", () => {
  const fixturesDir = path.resolve(__dirname, "../../../src/test/fixtures/extensionAdapter");

  const getFixtures = (): string[] => {
    return fs.readdirSync(fixturesDir).filter((dir) => {
      const stats = fs.statSync(path.join(fixturesDir, dir));
      return (
        stats.isDirectory() &&
        fs.existsSync(path.join(fixturesDir, dir, "extension.yaml")) &&
        fs.existsSync(path.join(fixturesDir, dir, "expected.json"))
      );
    });
  };

  const fixtures = getFixtures();

  fixtures.forEach((fixtureName) => {
    it(`should correctly convert ${fixtureName}`, async () => {
      const fixtureDir = path.join(fixturesDir, fixtureName);
      const expectedPath = path.join(fixtureDir, "expected.json");
      const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));

      const result = await detectAndAdaptExtension(fixtureDir, "test-project");

      expect(result).to.not.be.undefined;
      expect(result).to.deep.equal(expected);
    });
  });

  it("should return undefined for directory without extension.yaml", async () => {
    const result = await detectAndAdaptExtension("/tmp/no-extension", "test-project");

    expect(result).to.be.undefined;
  });
});
