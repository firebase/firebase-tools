import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { detectAndAdaptExtension } from "./extensionAdapter";

describe("extensionAdapter golden tests", () => {
  // Point to source fixtures directory since our fixtures don't have TypeScript files
  const fixturesDir = path.resolve(__dirname, "../../../src/test/fixtures/extensionAdapter");

  // Read all fixture directories
  const getFixtures = (): string[] => {
    try {
      return fs.readdirSync(fixturesDir).filter((dir) => {
        const stats = fs.statSync(path.join(fixturesDir, dir));
        return (
          stats.isDirectory() &&
          fs.existsSync(path.join(fixturesDir, dir, "extension.yaml")) &&
          fs.existsSync(path.join(fixturesDir, dir, "expected.json"))
        );
      });
    } catch (e) {
      return [];
    }
  };

  const fixtures = getFixtures();

  // Generate a test for each fixture
  fixtures.forEach((fixtureName) => {
    it(`should correctly convert ${fixtureName}`, async () => {
      const fixtureDir = path.join(fixturesDir, fixtureName);
      const expectedPath = path.join(fixtureDir, "expected.json");
      const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));

      // Run the adapter
      const result = await detectAndAdaptExtension(
        fixtureDir,
        path.join(fixtureDir, "functions"),
        "test-project",
        "nodejs20",
      );

      expect(result).to.not.be.undefined;

      // Deep compare the result with expected
      expect(result).to.deep.equal(expected);
    });
  });

  // Also test that non-extension directories return undefined
  it("should return undefined for directory without extension.yaml", async () => {
    const result = await detectAndAdaptExtension(
      "/tmp/no-extension",
      "/tmp/no-extension/functions",
      "test-project",
      "nodejs20",
    );

    expect(result).to.be.undefined;
  });
});
