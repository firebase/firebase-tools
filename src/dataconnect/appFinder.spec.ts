import { expect } from "chai";
import * as fs from "fs-extra";
import { getPlatformFromFolder } from "./appFinder";
import { Platform } from "./types";

describe("getPlatformFromFolder", () => {
  const testDir = "test-dir";

  afterEach(() => {
    fs.removeSync(testDir);
  });

  it("should return WEB if package.json exists", async () => {
    fs.outputFileSync(`${testDir}/package.json`, "{}");
    const platform = await getPlatformFromFolder(testDir);
    expect(platform).to.equal(Platform.WEB);
  });

  it("should return ANDROID if src/main exists", async () => {
    fs.mkdirpSync(`${testDir}/src/main`);
    const platform = await getPlatformFromFolder(testDir);
    expect(platform).to.equal(Platform.ANDROID);
  });

  it("should return IOS if .xcodeproj exists", async () => {
    fs.mkdirpSync(`${testDir}/a.xcodeproj`);
    const platform = await getPlatformFromFolder(testDir);
    expect(platform).to.equal(Platform.IOS);
  });

  it("should return FLUTTER if pubspec.yaml exists", async () => {
    fs.outputFileSync(`${testDir}/pubspec.yaml`, "name: test");
    const platform = await getPlatformFromFolder(testDir);
    expect(platform).to.equal(Platform.FLUTTER);
  });

  it("should return MULTIPLE if multiple identifiers exist", async () => {
    fs.outputFileSync(`${testDir}/package.json`, "{}");
    fs.outputFileSync(`${testDir}/pubspec.yaml`, "name: test");
    const platform = await getPlatformFromFolder(testDir);
    expect(platform).to.equal(Platform.MULTIPLE);
  });

  it("should return NONE if no identifiers exist", async () => {
    fs.mkdirpSync(testDir);
    const platform = await getPlatformFromFolder(testDir);
    expect(platform).to.equal(Platform.NONE);
  });
});
