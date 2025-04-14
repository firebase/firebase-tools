import { join } from "path";

const zipFixturesDir = __dirname;
const testDataDir = join(zipFixturesDir, "node-unzipper-testData");

export const ZIP_CASES = [
  "compressed-cp866",
  "compressed-directory-entry",
  "compressed-flags-set",
  "compressed-standard",
  "uncompressed",
  "zip-slip",
  "zip64",
].map((name) => ({
  name,
  archivePath: join(testDataDir, name, "archive.zip"),
  inflatedDir: join(testDataDir, name, "inflated"),
}));
