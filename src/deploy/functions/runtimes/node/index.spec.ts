import { expect } from "chai";
import * as sinon from "sinon";
import * as path from "path";
import { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import nock from "../../../../test/helpers/nock";

import * as node from ".";
import * as versioning from "./versioning";
import * as utils from "../../../../utils";
import { FirebaseError } from "../../../../error";
import { Runtime } from "../supported";
import * as discovery from "../discovery";

const PROJECT_ID = "test-project";
const PROJECT_DIR = "/some/path";
const SOURCE_DIR = "/some/path/fns";

describe("NodeDelegate", () => {
  describe("getNodeBinary", () => {
    let warnSpy: sinon.SinonSpy;
    let successSpy: sinon.SinonSpy;
    let hostVersionMock: sinon.SinonStub;
    let localVersionMock: sinon.SinonStub;

    beforeEach(() => {
      warnSpy = sinon.spy(utils, "logLabeledWarning");
      successSpy = sinon.spy(utils, "logLabeledSuccess");
      hostVersionMock = sinon.stub(process, "versions");
      localVersionMock = sinon.stub(versioning, "findModuleVersion");
    });

    afterEach(() => {
      warnSpy.restore();
      successSpy.restore();
      hostVersionMock.restore();
      localVersionMock.restore();
    });

    it("prefers locally cached node version if matched with requested version", () => {
      localVersionMock.returns("12.0.0");
      hostVersionMock.value({ node: "14.5.0" });
      const requestedRuntime = "nodejs12";
      const delegate = new node.Delegate(PROJECT_ID, PROJECT_DIR, SOURCE_DIR, requestedRuntime);
      expect(delegate.getNodeBinary()).to.equal(path.join(SOURCE_DIR, "node_modules", "node"));
      expect(successSpy).to.have.been.calledWith(
        "functions",
        sinon.match("node@12 from local cache."),
      );
      expect(warnSpy).to.not.have.been.called;
    });

    it("checks if requested and hosted runtime version matches", () => {
      hostVersionMock.value({ node: "12.5.0" });
      const requestedRuntime = "nodejs12";
      const delegate = new node.Delegate(PROJECT_ID, PROJECT_DIR, SOURCE_DIR, requestedRuntime);
      expect(delegate.getNodeBinary()).to.equal(process.execPath);
      expect(successSpy).to.have.been.calledWith("functions", sinon.match("node@12 from host."));
      expect(warnSpy).to.not.have.been.called;
    });

    it("warns users if hosted and requested runtime version differs", () => {
      hostVersionMock.value({ node: "12.0.0" });
      const requestedRuntime = "nodejs10";
      const delegate = new node.Delegate(PROJECT_ID, PROJECT_DIR, SOURCE_DIR, requestedRuntime);

      expect(delegate.getNodeBinary()).to.equal(process.execPath);
      expect(successSpy).to.not.have.been.called;
      expect(warnSpy).to.have.been.calledWith("functions", sinon.match("doesn't match"));
    });

    it("throws errors if requested runtime version is invalid", () => {
      const invalidRuntime = "foobar";
      const delegate = new node.Delegate(
        PROJECT_ID,
        PROJECT_DIR,
        SOURCE_DIR,
        invalidRuntime as Runtime,
      );

      expect(() => delegate.getNodeBinary()).to.throw(FirebaseError);
    });
  });

  describe("discoverBuild", () => {
    let getFunctionsSDKVersionMock: sinon.SinonStub;
    let detectFromYamlMock: sinon.SinonStub;

    beforeEach(() => {
      getFunctionsSDKVersionMock = sinon.stub(versioning, "getFunctionsSDKVersion");
      detectFromYamlMock = sinon.stub(discovery, "detectFromYaml");
    });

    afterEach(() => {
      getFunctionsSDKVersionMock.restore();
      detectFromYamlMock.restore();
    });

    it("throws error if SDK version is too old", async () => {
      getFunctionsSDKVersionMock.returns("3.19.0");
      const delegate = new node.Delegate(
        PROJECT_ID,
        PROJECT_DIR,
        SOURCE_DIR,
        "nodejs16" as Runtime,
      );
      try {
        await delegate.discoverBuild({}, {});
        throw new Error("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(FirebaseError);
        expect(err.message).to.include("Please update firebase-functions SDK");
      }
    });

    it("proceeds if SDK version is valid", async () => {
      getFunctionsSDKVersionMock.returns("4.0.0");
      detectFromYamlMock.resolves({ endpoints: {} });
      const delegate = new node.Delegate(
        PROJECT_ID,
        PROJECT_DIR,
        SOURCE_DIR,
        "nodejs16" as Runtime,
      );
      await delegate.discoverBuild({}, {});
      expect(detectFromYamlMock).to.have.been.called;
    });

    it("proceeds if SDK version is invalid", async () => {
      getFunctionsSDKVersionMock.returns("not-a-version");
      detectFromYamlMock.resolves({ endpoints: {} });
      const delegate = new node.Delegate(
        PROJECT_ID,
        PROJECT_DIR,
        SOURCE_DIR,
        "nodejs16" as Runtime,
      );
      await delegate.discoverBuild({}, {});
      expect(detectFromYamlMock).to.have.been.called;
    });
  });

  describe("serveAdmin", () => {
    const PORT = "8099";
    let child: ChildProcess;
    let delegate: node.Delegate;

    beforeEach(() => {
      const emitter = new EventEmitter() as EventEmitter & {
        stderr: EventEmitter;
        killed: boolean;
        kill: () => boolean;
      };
      emitter.stderr = new EventEmitter();
      emitter.killed = false;
      emitter.kill = () => true;
      child = emitter as unknown as ChildProcess;
      delegate = new node.Delegate(PROJECT_ID, PROJECT_DIR, SOURCE_DIR, "nodejs16" as Runtime);
      // spawnFunctionsProcess is private; serveAdmin is the seam under test.
      sinon
        .stub(
          delegate as unknown as { spawnFunctionsProcess: () => ChildProcess },
          "spawnFunctionsProcess",
        )
        .returns(child);
    });

    afterEach(() => {
      sinon.verifyAndRestore();
      nock.cleanAll();
    });

    it("reports a crash during module load rather than leaving discovery to time out", async () => {
      const { serverExited } = await delegate.serveAdmin({}, {}, PORT);

      child.stderr?.emit("data", Buffer.from("ReferenceError: db is not defined"));
      child.emit("exit", 1, null);
      child.emit("close", 1, null);

      await expect(serverExited).to.eventually.be.rejectedWith(
        FirebaseError,
        /exited with code 1[\s\S]*ReferenceError: db is not defined/,
      );
    });

    it("reports a spawn failure, which emits no exit at all", async () => {
      const { serverExited } = await delegate.serveAdmin({}, {}, PORT);

      child.emit("error", new Error("spawn ENOENT"));
      child.emit("close", -2, null);

      await expect(serverExited).to.eventually.be.rejectedWith(FirebaseError, /failed to start/);
    });

    it("shuts down without throwing after a spawn failure", async () => {
      const { kill } = await delegate.serveAdmin({}, {}, PORT);

      child.emit("error", new Error("spawn ENOENT"));
      child.emit("close", -2, null);

      // kill() runs in discoverBuild's finally, so anything it throws replaces the
      // error discovery actually failed with.
      await expect(kill()).to.eventually.be.fulfilled;
    });

    it("does not report the exit it asked for", async () => {
      nock("http://localhost:8099").get("/__/quitquitquit").reply(200);
      const { kill, serverExited } = await delegate.serveAdmin({}, {}, PORT);

      const killed = kill();
      const closing = setInterval(() => child.emit("close", 0, null), 5);
      try {
        await killed;
      } finally {
        clearInterval(closing);
      }

      const pending = Symbol("pending");
      const settled = await Promise.race([
        serverExited.then(
          () => "settled",
          () => "settled",
        ),
        new Promise((resolve) => setTimeout(() => resolve(pending), 50)),
      ]);
      expect(settled).to.equal(pending);
    });
  });
});
