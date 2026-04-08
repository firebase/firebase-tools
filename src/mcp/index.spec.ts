import { expect } from "chai";
import * as mockfs from "mock-fs";
import * as sinon from "sinon";
import { FirebaseMcpServer } from "./index";
import * as requireAuthModule from "../requireAuth";

describe("FirebaseMcpServer.getAuthenticatedUser", () => {
  let server: FirebaseMcpServer;
  let requireAuthStub: sinon.SinonStub;

  beforeEach(() => {
    // Mock the methods that may cause hanging BEFORE creating the instance
    sinon.stub(FirebaseMcpServer.prototype, "detectProjectRoot").resolves("/test/project");
    sinon.stub(FirebaseMcpServer.prototype, "detectActiveFeatures").resolves([]);

    server = new FirebaseMcpServer({});

    // Mock the resolveOptions method to avoid dependency issues
    sinon.stub(server, "resolveOptions").resolves({});

    requireAuthStub = sinon.stub(requireAuthModule, "requireAuth");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return email when authenticated user is present", async () => {
    const testEmail = "test@example.com";
    requireAuthStub.resolves(testEmail);

    const result = await server.getAuthenticatedUser();

    expect(result).to.equal(testEmail);
    expect(requireAuthStub.calledOnce).to.be.true;
  });

  it("should return null when no user and skipAutoAuth is true", async () => {
    requireAuthStub.resolves(null);

    const result = await server.getAuthenticatedUser(true);

    expect(result).to.be.null;
    expect(requireAuthStub.calledOnce).to.be.true;
  });

  it("should return 'Application Default Credentials' when no user and skipAutoAuth is false", async () => {
    requireAuthStub.resolves(null);

    const result = await server.getAuthenticatedUser(false);

    expect(result).to.equal("Application Default Credentials");
    expect(requireAuthStub.calledOnce).to.be.true;
  });

  it("should return null when requireAuth throws an error", async () => {
    requireAuthStub.rejects(new Error("Auth failed"));

    const result = await server.getAuthenticatedUser();

    expect(result).to.be.null;
    expect(requireAuthStub.calledOnce).to.be.true;
  });
});

describe("FirebaseMcpServer.detectActiveFeatures", () => {
  let server: FirebaseMcpServer;

  beforeEach(() => {
    sinon.stub(FirebaseMcpServer.prototype, "detectProjectSetup").resolves();

    server = new FirebaseMcpServer({ projectRoot: "/test-dir" });
    sinon.stub(server, "ready").resolves();

    sinon.stub(server, "getProjectId").resolves("");
    sinon.stub(server, "getAuthenticatedUser").resolves(null);
  });

  afterEach(() => {
    mockfs.restore();
    sinon.restore();
  });

  it("detects Crashlytics for a Flutter project without a prior detectProjectRoot call", async () => {
    mockfs({
      "/test-dir": {
        "pubspec.yaml": "dependencies:\n  firebase_crashlytics: ^5.0.0",
        lib: {
          "firebase_options.dart":
            "const FirebaseOptions android = FirebaseOptions(appId: '1:123:android:abc');",
        },
        android: {
          app: {
            "build.gradle": "plugins { id 'com.google.firebase.crashlytics' }",
          },
          src: {
            main: {},
          },
        },
      },
    });

    const detectedFeatures = await server.detectActiveFeatures();

    expect(detectedFeatures).to.include("crashlytics");
  });
});
