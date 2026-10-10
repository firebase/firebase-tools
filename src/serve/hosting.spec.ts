import { expect } from "chai";
import * as sinon from "sinon";
import * as superstatic from "superstatic";
import * as portUtils from "../emulator/portUtils";
import * as hostingConfig from "../hosting/config";
import * as implicitInit from "../hosting/implicitInit";
import * as hosting from "./hosting";
import * as requireHostingSite from "../requireHostingSite";
import * as utils from "../utils";
import { Writable } from "stream";
import { once } from "events";
import { Server } from "http";
import { AddressInfo } from "net";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const realSuperstatic = superstatic.server;
const realCreateDestroyer = utils.createDestroyer;

describe("hosting", () => {
  const sandbox = sinon.createSandbox();

  let checkListenableStub: sinon.SinonStub;
  let hostingConfigStub: sinon.SinonStub;
  let requireHostingSiteStub: sinon.SinonStub;
  let superstaticStub: sinon.SinonStub;
  let createDestroyerStub: sinon.SinonStub;

  let superstaticServer: { on: sinon.SinonStub; listen: sinon.SinonStub };

  beforeEach(() => {
    checkListenableStub = sandbox.stub(portUtils, "checkListenable").resolves(true);
    hostingConfigStub = sandbox.stub(hostingConfig, "hostingConfig").returns([
      {
        site: "site-one",
        public: "public",
      },
    ]);
    sandbox.stub(implicitInit, "implicitInit").resolves({
      json: JSON.stringify({ hosting: {} }),
      js: "",
      emulatorsJs: "",
    } as any);
    requireHostingSiteStub = sandbox.stub(requireHostingSite, "requireHostingSite").resolves();

    superstaticServer = {
      on: sandbox.stub(),
      listen: sandbox.stub().callsFake((cb) => {
        if (cb) {
          cb();
        }
        return superstaticServer;
      }),
    };
    superstaticStub = sandbox.stub(superstatic, "server").returns(superstaticServer as any);
    createDestroyerStub = sandbox.stub(utils, "createDestroyer").returns(sandbox.stub().resolves());
    sandbox.stub(Writable.prototype, "_write").resolves();
  });

  afterEach(async () => {
    try {
      await hosting.stop();
    } finally {
      sandbox.restore();
    }
  });

  describe("start", () => {
    it("should start a superstatic server with the correct config", async () => {
      const options = { port: 8080, host: "localhost" };
      await hosting.start(options);

      expect(superstaticStub).to.have.been.calledOnce;
      const superstaticConfig = superstaticStub.getCall(0).args[0];
      expect(superstaticConfig.port).to.equal(8080);
      expect(superstaticConfig.hostname).to.equal("localhost");
      expect(superstaticConfig.config.public).to.equal("public");
      expect(superstaticServer.listen).to.have.been.calledOnce;
    });

    it("should require a hosting site if not specified", async () => {
      const options = { port: 8080, host: "localhost" };
      await hosting.start(options);
      expect(requireHostingSiteStub).to.have.been.calledOnceWith(options);
    });

    it("should not require a hosting site if one is specified", async () => {
      const options = { port: 8080, host: "localhost", site: "my-site" };
      await hosting.start(options);
      expect(requireHostingSiteStub).to.not.have.been.called;
    });

    it("should find an available port", async () => {
      const options = { port: 8080, host: "localhost" };
      checkListenableStub
        .withArgs({ address: "localhost", port: 8080, family: "IPv6" })
        .resolves(false);
      checkListenableStub
        .withArgs({ address: "localhost", port: 8081, family: "IPv6" })
        .resolves(true);

      await hosting.start(options);

      expect(superstaticStub).to.have.been.calledOnce;
      const superstaticConfig = superstaticStub.getCall(0).args[0];
      expect(superstaticConfig.port).to.equal(8081);
    });

    it("should start multiple servers for multiple hosting configs", async () => {
      const options = { port: 8080, host: "localhost" };
      hostingConfigStub.returns([
        { site: "site-one", public: "public" },
        { site: "site-two", public: "public" },
      ]);

      await hosting.start(options);

      expect(superstaticStub).to.have.been.calledTwice;
      const port1 = superstaticStub.getCall(0).args[0].port;
      const port2 = superstaticStub.getCall(1).args[0].port;
      expect(port1).to.equal(8080);
      expect(port2).to.equal(8085);
    });
  });

  describe("stop", () => {
    it("should stop every hosting site", async () => {
      const first = sandbox.stub().resolves();
      const second = sandbox.stub().resolves();
      hostingConfigStub.returns([
        { site: "site-one", public: "public" },
        { site: "site-two", public: "public" },
      ]);
      createDestroyerStub.onFirstCall().returns(first);
      createDestroyerStub.onSecondCall().returns(second);

      await hosting.start({ port: 8080, host: "localhost" });
      await hosting.stop();

      expect(first).to.have.been.calledOnce;
      expect(second).to.have.been.calledOnce;
    });

    it("should wait for an in-progress shutdown when stopped again", async () => {
      let finish!: () => void;
      const closing = new Promise<void>((resolve) => {
        finish = resolve;
      });
      createDestroyerStub.returns(() => closing);
      await hosting.start({ port: 8080, host: "localhost" });

      const firstStop = hosting.stop();
      let secondFinished = false;
      const secondStop = hosting.stop().then(() => {
        secondFinished = true;
      });
      try {
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(secondFinished).to.equal(false);
      } finally {
        finish();
        await Promise.all([firstStop, secondStop]);
      }
      expect(secondFinished).to.equal(true);
    });

    it("should retain a server started while an earlier server is stopping", async () => {
      let finish!: () => void;
      const closing = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const first = sandbox.stub().returns(closing);
      const second = sandbox.stub().resolves();
      createDestroyerStub.onFirstCall().returns(first);
      createDestroyerStub.onSecondCall().returns(second);
      await hosting.start({ port: 8080, host: "localhost" });
      const firstStop = hosting.stop();
      try {
        await hosting.start({ port: 9090, host: "localhost" });
      } finally {
        finish();
        await firstStop;
      }

      expect(second).to.not.have.been.called;
      await hosting.stop();
      expect(first).to.have.been.calledOnce;
      expect(second).to.have.been.calledOnce;
    });

    it("should wait for every server before reporting a shutdown failure", async () => {
      const error = new Error("shutdown failed");
      let finish!: () => void;
      const closing = new Promise<void>((resolve) => {
        finish = resolve;
      });
      let secondFinished = false;
      const first = sandbox.stub().rejects(error);
      const second = sandbox.stub().callsFake(async () => {
        await closing;
        secondFinished = true;
      });
      hostingConfigStub.returns([
        { site: "site-one", public: "public" },
        { site: "site-two", public: "public" },
      ]);
      createDestroyerStub.onFirstCall().returns(first);
      createDestroyerStub.onSecondCall().returns(second);
      await hosting.start({ port: 8080, host: "localhost" });

      let stopFinished = false;
      let stopError: unknown;
      const stopping = hosting.stop().then(
        () => {
          stopFinished = true;
        },
        (err: unknown) => {
          stopFinished = true;
          stopError = err;
        },
      );
      try {
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(stopFinished).to.equal(false);
      } finally {
        finish();
        await stopping;
      }

      expect(stopError).to.equal(error);
      expect(secondFinished).to.equal(true);
      expect(first).to.have.been.calledOnce;
      expect(second).to.have.been.calledOnce;
    });

    it("should close both real HTTP listeners after serving multiple sites", async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "firebase-hosting-stop-"));
      const servers: Server[] = [];
      const destroyers: (() => Promise<void>)[] = [];
      try {
        await fs.writeFile(path.join(directory, "index.html"), "multi-site hosting");
        await fs.writeFile(path.join(directory, "firebase.json"), "{}");
        hostingConfigStub.returns([
          { site: "site-one", public: "." },
          { site: "site-two", public: "." },
        ]);
        // Let the OS choose a free port for each real server.
        superstaticStub.callsFake((options: Parameters<typeof realSuperstatic>[0]) =>
          realSuperstatic({ ...options, port: 0 }),
        );
        createDestroyerStub.callsFake((server: Server) => {
          servers.push(server);
          const destroyer = realCreateDestroyer(server);
          destroyers.push(destroyer);
          return destroyer;
        });
        await hosting.start({ port: 8080, host: "127.0.0.1", cwd: directory });
        await Promise.all(
          servers.map((server) =>
            server.listening ? Promise.resolve() : once(server, "listening"),
          ),
        );
        expect(servers).to.have.length(2);
        for (const server of servers) {
          const response = await fetch(
            `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
          );
          expect(response.status).to.equal(200);
          expect(await response.text()).to.equal("multi-site hosting");
        }

        await hosting.stop();
        expect(servers.map((server) => server.listening)).to.deep.equal([false, false]);
      } finally {
        await Promise.all(destroyers.map((destroy) => destroy()));
        await fs.rm(directory, { recursive: true, force: true });
      }
    });

    it("should call the destroyer if the server was started", async () => {
      const destroyer = sandbox.stub().resolves();
      createDestroyerStub.returns(destroyer);
      const options = { port: 8080, host: "localhost" };
      await hosting.start(options);
      await hosting.stop();
      expect(destroyer).to.have.been.calledOnce;
    });

    it("should do nothing if the server was not started", async () => {
      const destroyer = sandbox.stub().resolves();
      createDestroyerStub.returns(destroyer);
      await hosting.stop();
      expect(destroyer).to.not.have.been.called;
    });
  });
});
