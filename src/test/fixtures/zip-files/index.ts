import { join } from "path";

const zipFixturesDir = __dirname;
const testDataDir = join(zipFixturesDir, "node-unzipper-testData");

export const ZIP_CASES = [
  { name: "compressed-cp866" },
  { name: "compressed-directory-entry" },
  { name: "compressed-flags-set" },
  { name: "compressed-standard" },
  { name: "uncompressed" },
  { name: "zip-slip", wantErr: "a path outside of" },
  { name: "zip-slip-prefix", wantErr: "a path outside of" },
  { name: "zip64" },
].map(({ name, wantErr }) => ({
  name,
  archivePath: join(testDataDir, name, "archive.zip"),
  inflatedDir: join(testDataDir, name, "inflated"),
  wantErr,
}));
