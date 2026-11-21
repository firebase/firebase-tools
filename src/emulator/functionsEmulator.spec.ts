import { expect } from "chai";
import * as supertest from "supertest";

import {
  BackendInfo,
  EmulatableBackend,
  FunctionsEmulator,
  getAllowedEmulatorUIOrigins,
} from "./functionsEmulator";
import { EmulatorRegistry } from "./registry";
import { Emulators } from "./types";
import { FakeEmulator } from "./testing/fakeEmulator";

describe("FunctionsEmulator /backends CORS and origin enforcement", () => {
  const originalWebHost = process.env.WEB_HOST;
  const originalCodespaceName = process.env.CODESPACE_NAME;
  const originalCodespaceDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;

  let emu: FunctionsEmulator | undefined;

  function restoreEnvVar(key: string, value: string | undefined): void {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  function createTestFunctionsEmulator(): FunctionsEmulator {
    const backendFixture: EmulatableBackend = {
      functionsDir: "/workspace/demo-project/functions-src",
      env: { SAMPLE_CONFIG_KEY: "sample-config-value" },
      secretEnv: [],
      codebase: "primary-codebase",
      predefinedTriggers: [
        {
          entryPoint: "helloHttpEntry",
          name: "helloHttpTrigger",
          platform: "gcfv2",
          httpsTrigger: {},
        },
      ],
    };
    return new FunctionsEmulator({
      projectId: "demo-backends-project",
      projectDir: "/workspace/demo-project",
      emulatableBackends: [backendFixture],
      debugPort: false,
      host: "127.0.0.1",
      port: 5001,
    });
  }

  beforeEach(() => {
    delete process.env.WEB_HOST;
    delete process.env.CODESPACE_NAME;
    delete process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  });

  afterEach(async () => {
    restoreEnvVar("WEB_HOST", originalWebHost);
    restoreEnvVar("CODESPACE_NAME", originalCodespaceName);
    restoreEnvVar("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", originalCodespaceDomain);
    if (emu) {
      await emu.stop();
      emu = undefined;
    }
    await EmulatorRegistry.stopAll();
  });

  describe("getAllowedEmulatorUIOrigins", () => {
    it("returns an empty array when the Emulator UI is not running", () => {
      expect(getAllowedEmulatorUIOrigins()).to.deep.equal([]);
    });

    it("returns loopback origins matching the running Emulator UI port", async () => {
      const fakeUi = await FakeEmulator.create(Emulators.UI, "127.0.0.1");
      await EmulatorRegistry.start(fakeUi);
      const uiPort = fakeUi.getInfo().port;

      const origins = getAllowedEmulatorUIOrigins();
      expect(origins).to.include(`http://localhost:${uiPort}`);
      expect(origins).to.include(`http://127.0.0.1:${uiPort}`);
      expect(origins).to.include(`http://[::1]:${uiPort}`);
    });

    it("includes forwarded cloud IDE origins when WEB_HOST or Codespaces env vars are set", async () => {
      process.env.WEB_HOST = "workstation.cluster.example.dev";
      process.env.CODESPACE_NAME = "demo-space";
      process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN = "app.github.dev";

      const fakeUi = await FakeEmulator.create(Emulators.UI, "127.0.0.1");
      await EmulatorRegistry.start(fakeUi);
      const uiPort = fakeUi.getInfo().port;

      const origins = getAllowedEmulatorUIOrigins();
      expect(origins).to.include(`https://${uiPort}-workstation.cluster.example.dev`);
      expect(origins).to.include(`https://demo-space-${uiPort}.app.github.dev`);
    });
  });

  describe("GET /backends", () => {
    interface BackendsResponseBody {
      backends?: BackendInfo[];
      message?: string;
    }

    it("allows non-browser requests without an Origin header", async () => {
      emu = createTestFunctionsEmulator();
      const app = emu.createHubServer();

      const res = await supertest(app).get("/backends").expect(200);
      const body = res.body as BackendsResponseBody;
      expect(res.get("access-control-allow-origin")).to.be.undefined;
      expect(body.backends).to.have.lengthOf(1);
      expect(body.backends?.[0].directory).to.equal("/workspace/demo-project/functions-src");
    });

    it("rejects untrusted cross-origin GET and OPTIONS requests when UI is not running", async () => {
      emu = createTestFunctionsEmulator();
      const app = emu.createHubServer();

      const preflightRes = await supertest(app)
        .options("/backends")
        .set("Origin", "https://evil.example.com")
        .set("Access-Control-Request-Method", "GET")
        .expect(403);
      expect(preflightRes.get("access-control-allow-origin")).to.be.undefined;

      const getRes = await supertest(app)
        .get("/backends")
        .set("Origin", "https://evil.example.com")
        .expect(403);
      expect(getRes.get("access-control-allow-origin")).to.be.undefined;
      expect(getRes.body).to.deep.equal({
        message: "/backends cannot be accessed by external callers.",
      });
    });

    it("allows requests from the running Emulator UI origin while rejecting external origins", async () => {
      const fakeUi = await FakeEmulator.create(Emulators.UI, "127.0.0.1");
      await EmulatorRegistry.start(fakeUi);
      const uiOrigin = `http://localhost:${fakeUi.getInfo().port}`;

      emu = createTestFunctionsEmulator();
      const app = emu.createHubServer();

      const preflightRes = await supertest(app)
        .options("/backends")
        .set("Origin", uiOrigin)
        .set("Access-Control-Request-Method", "GET")
        .expect(204);
      expect(preflightRes.get("access-control-allow-origin")).to.equal(uiOrigin);

      const allowedRes = await supertest(app).get("/backends").set("Origin", uiOrigin).expect(200);
      const allowedBody = allowedRes.body as BackendsResponseBody;
      expect(allowedRes.get("access-control-allow-origin")).to.equal(uiOrigin);
      expect(allowedBody.backends).to.have.lengthOf(1);

      const blockedRes = await supertest(app)
        .get("/backends")
        .set("Origin", "https://evil.example.com")
        .expect(403);
      const blockedBody = blockedRes.body as BackendsResponseBody;
      expect(blockedRes.get("access-control-allow-origin")).to.be.undefined;
      expect(blockedBody.backends).to.be.undefined;
    });
  });
});
