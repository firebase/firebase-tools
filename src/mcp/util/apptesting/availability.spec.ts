import * as mockfs from "mock-fs";
import * as sinon from "sinon";
import { FirebaseMcpServer } from "../../index";
import { RC } from "../../../rc";
import { Config } from "../../../config";
import { McpContext } from "../../types";
import { isAppTestingAvailable } from "./availability";
import { expect } from "chai";
import * as ensureApiEnabled from "../../../ensureApiEnabled";

describe("isAppTestingAvailable", () => {
  let sandbox: sinon.SinonSandbox;
  let checkStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    checkStub = sandbox.stub(ensureApiEnabled, "check");
  });

  afterEach(() => {
    sandbox.restore();
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
    isBillingEnabled: false,
  });

  it("returns false for non mobile project", async () => {
    checkStub.resolves(true);
    mockfs({
      "/test-dir": {
        "package.json": '{ "name": "web-app" }',
        "index.html": "<html></html>",
      },
    });
    const result = await isAppTestingAvailable(mockContext("/test-dir"));
    expect(result).to.be.false;
  });

  it("returns false if App Distribution API isn't enabled", async () => {
    checkStub.resolves(false);
    mockfs({
      "/test-dir": {
        android: {
          "build.gradle": "",
          src: { main: {} },
        },
      },
    });
    const result = await isAppTestingAvailable(mockContext("/test-dir"));
    expect(result).to.be.false;
  });

  it("returns true for an Android project with API enabled", async () => {
    checkStub.resolves(true);
    mockfs({
      "/test-dir": {
        android: {
          "build.gradle": "",
          src: { main: {} },
        },
      },
    });
    const result = await isAppTestingAvailable(mockContext("/test-dir"));
    expect(result).to.be.true;
  });

  it("returns true for an iOS project with API enabled", async () => {
    checkStub.resolves(true);
    mockfs({
      "/test-dir": {
        ios: {
          Podfile: "",
          "Project.xcodeproj": {},
        },
      },
    });
    const result = await isAppTestingAvailable(mockContext("/test-dir"));
    expect(result).to.be.true;
  });

  it("returns true for an Flutter project with API enabled", async () => {
    checkStub.resolves(true);
    mockfs({
      "/test-dir": {
        "pubspec.yaml": "",
        ios: { "Runner.xcodeproj": {} },
        android: { src: { main: {} } },
      },
    });
    const result = await isAppTestingAvailable(mockContext("/test-dir"));
    expect(result).to.be.true;
  });
});
