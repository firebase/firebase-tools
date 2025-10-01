import { expect } from "chai";
import * as fs from "fs-extra";
import { getPlatformFromFolder, detectApps } from "./appFinder";
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

describe("detectApps", () => {
  const testDir = "test-dir";

  afterEach(() => {
    fs.removeSync(testDir);
  });

  it("should detect a web app", async () => {
    fs.outputFileSync(`${testDir}/package.json`, "{}");
    const apps = await detectApps(testDir);
    expect(apps).to.deep.equal([
      {
        platform: Platform.WEB,
        directory: ".",
        frameworks: [],
      },
    ]);
  });

  it("should detect an android app", async () => {
    fs.mkdirpSync(`${testDir}/src/main`);
    const apps = await detectApps(testDir);
    expect(apps).to.deep.equal([
      {
        platform: Platform.ANDROID,
        directory: ".",
      },
    ]);
  });

  it("should detect an ios app", async () => {
    fs.mkdirpSync(`${testDir}/a.xcodeproj`);
    const apps = await detectApps(testDir);
    expect(apps).to.deep.equal([
      {
        platform: Platform.IOS,
        directory: ".",
      },
    ]);
  });

  it("should detect a flutter app", async () => {
    fs.outputFileSync(`${testDir}/pubspec.yaml`, "name: test");
    const apps = await detectApps(testDir);
    expect(apps).to.deep.equal([
      {
        platform: Platform.FLUTTER,
        directory: ".",
      },
    ]);
  });

  it("should detect multiple apps", async () => {
    fs.mkdirpSync(`${testDir}/web`);
    fs.outputFileSync(`${testDir}/web/package.json`, "{}");
    fs.mkdirpSync(`${testDir}/android/src/main`);
    const apps = await detectApps(testDir);
    expect(apps).to.have.deep.members([
      {
        platform: Platform.WEB,
        directory: `web`,
        frameworks: [],
      },
      {
        platform: Platform.ANDROID,
        directory: `android`,
      },
    ]);
  });

  it("should detect web frameworks", async () => {
    fs.outputFileSync(
      `${testDir}/package.json`,
      JSON.stringify({
        dependencies: {
          react: "1.0.0",
        },
      }),
    );
    const apps = await detectApps(testDir);
    expect(apps).to.deep.equal([
      {
        platform: Platform.WEB,
        directory: ".",
        frameworks: ["react"],
      },
    ]);
  });

  it("should detect a nested web app", async () => {
    fs.mkdirpSync(`${testDir}/frontend`);
    fs.outputFileSync(`${testDir}/frontend/package.json`, "{}");
    const apps = await detectApps(testDir);
    expect(apps).to.deep.equal([
      {
        platform: Platform.WEB,
        directory: "frontend",
        frameworks: [],
      },
    ]);
  });

  it("should detect multiple top-level and nested apps", async () => {
    fs.mkdirpSync(`${testDir}/android/src/main`);
    fs.mkdirpSync(`${testDir}/ios/a.xcodeproj`);
    fs.mkdirpSync(`${testDir}/web/frontend`);
    fs.outputFileSync(`${testDir}/web/frontend/package.json`, "{}");

    const apps = await detectApps(testDir);
    const expected = [
      {
        platform: Platform.ANDROID,
        directory: "android",
      },
      {
        platform: Platform.IOS,
        directory: "ios",
      },
      {
        platform: Platform.WEB,
        directory: "web/frontend",
        frameworks: [],
      },
    ];
    expect(apps).to.have.deep.members(expected);
  });
});
