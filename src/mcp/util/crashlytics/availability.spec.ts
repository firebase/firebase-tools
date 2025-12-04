import { expect } from "chai";
import mockfs from "mock-fs";
import { isCrashlyticsAvailable } from "./availability";
import { McpContext } from "../../types";
import { Config } from "../../../config";
import { FirebaseMcpServer } from "../..";
import { RC } from "../../../rc";

describe("isCrashlyticsAvailable", () => {
  afterEach(() => {
    mockfs.restore();
  });

  const mockContext = (projectDir: string): McpContext => ({
    projectId: "test-project",
    accountEmail: null,
    config: {
      projectDir: projectDir,
    } as Config,
    host: new FirebaseMcpServer({}),
    rc: {} as RC,
    firebaseCliCommand: "firebase",
  });

  it("should return true for an Android project with Crashlytics in build.gradle", async () => {
    mockfs({
      "/test-dir": {
        android: {
          "build.gradle":
            "dependencies { implementation 'com.google.firebase:firebase-crashlytics' }",
          src: { main: {} },
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return true for an Android project with Crashlytics in build.gradle.kts", async () => {
    mockfs({
      "/test-dir": {
        android: {
          "build.gradle.kts":
            'dependencies { implementation("com.google.firebase:firebase-crashlytics") }',
          src: { main: {} },
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return true for an Android project with Crashlytics plugin alias", async () => {
    mockfs({
      "/test-dir": {
        android: {
          "build.gradle.kts": "plugins { alias(libs.plugins.firebase.crashlytics) }",
          src: { main: {} },
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return true for an Android project with Crashlytics ktx dependency", async () => {
    mockfs({
      "/test-dir": {
        android: {
          "build.gradle.kts": "dependencies { implementation(libs.firebase.crashlytics.ktx) }",
          src: { main: {} },
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return true for an Android project with 'apply plugin' syntax", async () => {
    mockfs({
      "/test-dir": {
        android: {
          "build.gradle": "apply plugin: 'com.google.firebase.crashlytics'",
          src: { main: {} },
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return true for an Android project with plugins block ID", async () => {
    mockfs({
      "/test-dir": {
        android: {
          "build.gradle": "plugins { id 'com.google.firebase.crashlytics' }",
          src: { main: {} },
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return true for an Android project with buildscript dependency", async () => {
    mockfs({
      "/test-dir": {
        android: {
          "build.gradle":
            "buildscript { dependencies { classpath 'com.google.firebase:firebase-crashlytics-gradle:2.9.1' } }",
          src: { main: {} },
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return false for an Android project without Crashlytics", async () => {
    mockfs({
      "/test-dir": {
        android: {
          "build.gradle": "dependencies { }",
          src: { main: {} },
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.false;
  });

  it("should return true for an iOS project with Firebase/Crashlytics in Podfile", async () => {
    mockfs({
      "/test-dir": {
        ios: {
          Podfile: "pod 'Firebase/Crashlytics'",
          "Project.xcodeproj": {},
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return true for an iOS project with FirebaseCrashlytics in Podfile", async () => {
    mockfs({
      "/test-dir": {
        ios: {
          Podfile: "pod 'FirebaseCrashlytics'",
          "Project.xcodeproj": {},
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return true for an iOS project with Crashlytics in Package.swift", async () => {
    mockfs({
      "/test-dir": {
        ios: {
          "Package.swift": '.product(name: "FirebaseCrashlytics", package: "Firebase"),',
          "Project.xcodeproj": {},
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return true for an iOS project with Crashlytics in Cartfile", async () => {
    mockfs({
      "/test-dir": {
        ios: {
          Cartfile: 'github "firebase/firebase-ios-sdk/Crashlytics"',
          "Project.xcodeproj": {},
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return true for an iOS project with Crashlytics binary in Cartfile", async () => {
    mockfs({
      "/test-dir": {
        ios: {
          Cartfile:
            'binary "https://dl.google.com/firebase/ios/carthage/FirebaseCrashlyticsBinary.json"\ngithub "firebase/firebase-ios-sdk/Crashlytics"',
          "Project.xcodeproj": {},
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return false for an iOS project without Crashlytics", async () => {
    mockfs({
      "/test-dir": {
        ios: {
          Podfile: "pod 'Firebase/Core'",
          "Project.xcodeproj": {},
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.false;
  });

  it("should return true for an iOS project with Crashlytics in project.pbxproj", async () => {
    mockfs({
      "/test-dir": {
        ios: {
          "Project.xcodeproj": {
            "project.pbxproj":
              "/* Begin PBXBuildFile section */  /* FirebaseCore in Frameworks */ = {isa = PBXBuildFile; /* FirebaseCore */; }; /* FirebaseCrashlytics in Frameworks */ = {isa = PBXBuildFile; /* FirebaseCrashlytics */; }; /* End PBXBuildFile section */",
          },
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return true for a Flutter project with Crashlytics in pubspec.yaml", async () => {
    mockfs({
      "/test-dir": {
        "pubspec.yaml": "dependencies:\n  firebase_crashlytics: ^2.0.0",
        ios: { "Runner.xcodeproj": {} },
        android: { src: { main: {} } },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });

  it("should return false for a Flutter project without Crashlytics", async () => {
    mockfs({
      "/test-dir": {
        "pubspec.yaml": "dependencies:\n  firebase_core: ^1.0.0",
        ios: { "Runner.xcodeproj": {} },
        android: { src: { main: {} } },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.false;
  });

  it("should return false for a project with no mobile platforms", async () => {
    mockfs({
      "/test-dir": {
        "package.json": '{ "name": "web-app" }',
        "index.html": "<html></html>",
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.false;
  });

  it("should return true if any platform uses crashlytics in a multi-platform project", async () => {
    mockfs({
      "/test-dir": {
        android: {
          "build.gradle":
            "dependencies { implementation 'com.google.firebase:firebase-crashlytics' }",
          src: { main: {} },
        },
        ios: {
          Podfile: "pod 'Firebase/Core'",
          "Project.xcodeproj": {},
        },
      },
    });

    const result = await isCrashlyticsAvailable(mockContext("/test-dir"));

    expect(result).to.be.true;
  });
});
