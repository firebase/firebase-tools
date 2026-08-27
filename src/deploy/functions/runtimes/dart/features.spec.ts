import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DartVersionFeatures } from "./features";

function writePackageConfig(sourceDir: string, languageVersion: string | undefined): void {
  fs.mkdirSync(path.join(sourceDir, ".dart_tool"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, ".dart_tool", "package_config.json"),
    JSON.stringify({
      configVersion: 2,
      packages: [
        { name: "my_function", rootUri: "../", packageUri: "lib/", languageVersion },
        { name: "some_dependency", rootUri: "some_dependency", languageVersion: "3.0" },
      ],
    }),
  );
}

describe("DartVersionFeatures", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dart-features-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reports native assets unavailable when package_config.json does not exist", async () => {
    const features = await DartVersionFeatures.detect(tmpDir);
    expect(features.isNativeAssetsAvailable).to.equal(false);
  });

  it("reports native assets unavailable when package_config.json is malformed", async () => {
    fs.mkdirSync(path.join(tmpDir, ".dart_tool"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".dart_tool", "package_config.json"), "not json");

    const features = await DartVersionFeatures.detect(tmpDir);
    expect(features.isNativeAssetsAvailable).to.equal(false);
  });

  it("reports native assets unavailable when package_config.json is valid JSON but not an object", async () => {
    fs.mkdirSync(path.join(tmpDir, ".dart_tool"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".dart_tool", "package_config.json"), "null");

    const features = await DartVersionFeatures.detect(tmpDir);
    expect(features.isNativeAssetsAvailable).to.equal(false);
  });

  it("reports native assets unavailable below the declared language version 3.13", async () => {
    writePackageConfig(tmpDir, "3.9");

    const features = await DartVersionFeatures.detect(tmpDir);
    expect(features.isNativeAssetsAvailable).to.equal(false);
  });

  it("reports native assets available at the declared language version 3.13", async () => {
    writePackageConfig(tmpDir, "3.13");

    const features = await DartVersionFeatures.detect(tmpDir);
    expect(features.isNativeAssetsAvailable).to.equal(true);
  });

  it("reports native assets available above the declared language version 3.13", async () => {
    writePackageConfig(tmpDir, "4.0");

    const features = await DartVersionFeatures.detect(tmpDir);
    expect(features.isNativeAssetsAvailable).to.equal(true);
  });

  it("reads the root package's language version, not a dependency's", async () => {
    // "some_dependency" in the fixture declares "3.0"; the root package ("../") declares 3.13.
    writePackageConfig(tmpDir, "3.13");

    const features = await DartVersionFeatures.detect(tmpDir);
    expect(features.isNativeAssetsAvailable).to.equal(true);
  });

  it("requires Dart 3.9.0 when native assets are unavailable", async () => {
    const features = await DartVersionFeatures.detect(tmpDir);
    expect(features.minDartSdkVersion).to.equal("3.9.0");
  });

  it("requires Dart 3.13.0 when native assets are available", async () => {
    writePackageConfig(tmpDir, "3.13");

    const features = await DartVersionFeatures.detect(tmpDir);
    expect(features.minDartSdkVersion).to.equal("3.13.0");
  });
});
