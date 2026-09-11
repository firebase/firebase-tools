import { expect } from "chai";
import { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import * as fs from "fs/promises";
import * as yaml from "yaml";
import * as sinon from "sinon";
import nock from "../../../../test/helpers/nock";

import * as api from "../../../../api";
import { FirebaseError } from "../../../../error";
import { logger } from "../../../../logger";
import * as discovery from ".";
import * as build from "../../build";

const MIN_ENDPOINT = {
  entryPoint: "entrypoint",
  httpsTrigger: {},
  serviceAccount: null,
};

const ENDPOINT: build.Endpoint = {
  ...MIN_ENDPOINT,
  platform: "gcfv2",
  project: "project",
  runtime: "nodejs16",
  region: [api.functionsDefaultRegion()],
  serviceAccount: null,
};

const YAML_OBJ = {
  specVersion: "v1alpha1",
  endpoints: { id: MIN_ENDPOINT },
};

const YAML_TEXT = yaml.stringify(YAML_OBJ);

const BUILD: build.Build = build.of({ id: ENDPOINT });

const TIMEOUT_ENV_VAR = "FUNCTIONS_DISCOVERY_TIMEOUT";
let originalTimeoutEnv: string | undefined;

// File level: an ambient FUNCTIONS_DISCOVERY_TIMEOUT changes the timeout every
// detectFromPort test below relies on, not just the ones that set it.
beforeEach(() => {
  originalTimeoutEnv = process.env[TIMEOUT_ENV_VAR];
  delete process.env[TIMEOUT_ENV_VAR];
});

afterEach(() => {
  if (originalTimeoutEnv === undefined) {
    delete process.env[TIMEOUT_ENV_VAR];
  } else {
    process.env[TIMEOUT_ENV_VAR] = originalTimeoutEnv;
  }
});

describe("yamlToBuild", () => {
  it("Accepts a valid v1alpha1 spec", () => {
    const parsed = discovery.yamlToBuild(
      YAML_OBJ,
      "project",
      api.functionsDefaultRegion(),
      "nodejs16",
    );
    expect(parsed).to.deep.equal(BUILD);
  });

  it("Requires a spec version", () => {
    const flawed: Record<string, unknown> = { ...YAML_OBJ };
    delete flawed.specVersion;
    expect(() =>
      discovery.yamlToBuild(flawed, "project", api.functionsDefaultRegion(), "nodejs16"),
    ).to.throw(FirebaseError);
  });

  it("Throws on unknown spec versions", () => {
    const flawed = {
      ...YAML_OBJ,
      specVersion: "32767beta2",
    };
    expect(() =>
      discovery.yamlToBuild(flawed, "project", api.functionsDefaultRegion(), "nodejs16"),
    ).to.throw(FirebaseError);
  });
});

describe("detectFromYaml", () => {
  let readFile: sinon.SinonStub;

  beforeEach(() => {
    readFile = sinon.stub(fs, "readFile");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("succeeds when YAML can be found", async () => {
    readFile.resolves(YAML_TEXT);

    await expect(
      discovery.detectFromYaml("directory", "project", "nodejs16"),
    ).to.eventually.deep.equal(BUILD);
  });

  it("returns undefined when YAML cannot be found", async () => {
    readFile.rejects({ code: "ENOENT" });

    await expect(discovery.detectFromYaml("directory", "project", "nodejs16")).to.eventually.equal(
      undefined,
    );
  });
});

describe("detectFromPort", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("passes as smoke test", async () => {
    nock("http://127.0.0.1:8080").get("/__/functions.yaml").times(5).replyWithError({
      message: "Still booting",
      code: "ECONNREFUSED",
    });

    nock("http://127.0.0.1:8080").get("/__/functions.yaml").times(3).replyWithError({
      message: "Almost there",
      code: "ETIMEDOUT",
    });

    nock("http://127.0.0.1:8080").get("/__/functions.yaml").reply(200, YAML_TEXT);

    const parsed = await discovery.detectFromPort(8080, "project", "nodejs16");
    expect(parsed).to.deep.equal(BUILD);
  });

  it("retries when request times out", async () => {
    nock("http://127.0.0.1:8081").get("/__/functions.yaml").delay(1_000).reply(200, YAML_TEXT);
    nock("http://127.0.0.1:8080").get("/__/functions.yaml").reply(200, YAML_TEXT);

    const parsed = await discovery.detectFromPort(8080, "project", "nodejs16", 0, 500);
    expect(parsed).to.deep.equal(BUILD);
  });

  it("explains how to extend the timeout when it expires", async () => {
    nock("http://127.0.0.1:8080").get("/__/functions.yaml").times(50).replyWithError({
      message: "Still booting",
      code: "ECONNREFUSED",
    });

    await expect(
      discovery.detectFromPort(8080, "project", "nodejs16", 0, 300),
    ).to.eventually.be.rejectedWith(FirebaseError, /FUNCTIONS_DISCOVERY_TIMEOUT/);
  });

  it("reports the crash when the server exits instead of blaming the timeout", async () => {
    nock("http://127.0.0.1:8080").get("/__/functions.yaml").times(50).replyWithError({
      message: "Still booting",
      code: "ECONNREFUSED",
    });

    const serverExited = Promise.reject(
      new FirebaseError("The functions process exited with code 1.\n\nOut of memory"),
    );
    serverExited.catch(() => {
      // Raced below; this only keeps the rejection from going unhandled first.
    });

    // The timeout is far longer than the test would tolerate, so passing at all
    // proves the exit is what ended discovery.
    await expect(
      discovery.detectFromPort(8080, "project", "nodejs16", 0, 60_000, serverExited),
    ).to.eventually.be.rejectedWith(FirebaseError, /Out of memory/);
  });
});

describe("watchDiscoveryProcess", () => {
  function fakeChild(): ChildProcess {
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
    child.stderr = new EventEmitter();
    return child as unknown as ChildProcess;
  }

  /** Whether a promise is still unsettled, which is how a healthy server looks. */
  async function isPending(p: Promise<unknown>): Promise<boolean> {
    const pending = Symbol("pending");
    const raced = await Promise.race([
      p.then(
        () => "settled",
        () => "settled",
      ),
      new Promise((resolve) => setTimeout(() => resolve(pending), 50)),
    ]);
    return raced === pending;
  }

  it("reports the exit code and stderr of a crash", async () => {
    const child = fakeChild();
    const watched = discovery.watchDiscoveryProcess(child);

    child.stderr?.emit("data", Buffer.from("FATAL ERROR: JavaScript heap out of memory\n"));
    child.emit("exit", 134, null);
    child.emit("close", 134, null);

    await expect(watched.serverExited).to.eventually.be.rejectedWith(
      FirebaseError,
      /exited with code 134[\s\S]*heap out of memory/,
    );
  });

  it("reports the signal when the process is killed", async () => {
    const child = fakeChild();
    const watched = discovery.watchDiscoveryProcess(child);

    child.emit("close", null, "SIGKILL");

    await expect(watched.serverExited).to.eventually.be.rejectedWith(FirebaseError, /SIGKILL/);
  });

  it("reports a failed spawn, which emits close but never exit", async () => {
    const child = fakeChild();
    const watched = discovery.watchDiscoveryProcess(child);

    child.emit("error", new Error("spawn /no/such/binary ENOENT"));
    child.emit("close", -2, null);

    await expect(watched.serverExited).to.eventually.be.rejectedWith(
      FirebaseError,
      /failed to start: spawn \/no\/such\/binary ENOENT/,
    );
    await expect(watched.serverExited).to.eventually.be.rejectedWith(FirebaseError, /^((?!-2).)*$/);
  });

  it("quotes only the tail of a large stderr", async () => {
    const child = fakeChild();
    const watched = discovery.watchDiscoveryProcess(child);

    child.stderr?.emit("data", Buffer.from("x".repeat(64 * 1024)));
    child.stderr?.emit("data", Buffer.from("\nthe part that explains it"));
    child.emit("close", 1, null);

    const err = await watched.serverExited.catch((e: FirebaseError) => e);
    expect(err.message).to.match(/the part that explains it$/);
    expect(err.message.length).to.be.lessThan(9 * 1024);
  });

  it("stays silent about an exit once disarmed", async () => {
    const child = fakeChild();
    const watched = discovery.watchDiscoveryProcess(child);

    watched.disarm();
    child.emit("close", 0, null);

    expect(await isPending(watched.serverExited)).to.be.true;
  });

  it("never settles while the server is healthy", async () => {
    const watched = discovery.watchDiscoveryProcess(fakeChild());

    expect(await isPending(watched.serverExited)).to.be.true;
    expect(watched.hasEnded()).to.be.false;
  });

  it("ends on exit without waiting for close", async () => {
    const child = fakeChild();
    const watched = discovery.watchDiscoveryProcess(child);

    child.emit("exit", 0, null);

    await watched.ended;
    expect(watched.hasEnded()).to.be.true;
  });

  it("ends rather than rejecting when the spawn failed", async () => {
    const child = fakeChild();
    const watched = discovery.watchDiscoveryProcess(child);

    child.emit("error", new Error("spawn EACCES"));
    child.emit("close", -13, null);

    await watched.ended;
    expect(watched.hasEnded()).to.be.true;
  });
});

describe("getFunctionDiscoveryTimeout", () => {
  const ENV_VAR = TIMEOUT_ENV_VAR;

  it("returns 0 when unset", () => {
    expect(discovery.getFunctionDiscoveryTimeout()).to.equal(0);
  });

  it("reads a bare number as seconds", () => {
    process.env[ENV_VAR] = "60";
    expect(discovery.getFunctionDiscoveryTimeout()).to.equal(60_000);
  });

  it("accepts an explicit seconds suffix", () => {
    process.env[ENV_VAR] = "60s";
    expect(discovery.getFunctionDiscoveryTimeout()).to.equal(60_000);
  });

  it("accepts an explicit milliseconds suffix", () => {
    process.env[ENV_VAR] = "60000ms";
    expect(discovery.getFunctionDiscoveryTimeout()).to.equal(60_000);
  });

  it("ignores a value it cannot parse", () => {
    process.env[ENV_VAR] = "one minute";
    expect(discovery.getFunctionDiscoveryTimeout()).to.equal(0);
  });

  it("ignores a negative value rather than timing out instantly", () => {
    process.env[ENV_VAR] = "-1";
    expect(discovery.getFunctionDiscoveryTimeout()).to.equal(0);
  });

  it("parses once, so an emulator's per-worker calls do not repeat the warning", () => {
    const warn = sinon.stub(logger, "warn");
    try {
      process.env[ENV_VAR] = "45000";
      expect(discovery.getFunctionDiscoveryTimeout()).to.equal(45_000_000);
      expect(discovery.getFunctionDiscoveryTimeout()).to.equal(45_000_000);
      expect(warn).to.have.been.calledOnce;
    } finally {
      warn.restore();
    }
  });

  it("warns when a bare value looks like milliseconds", () => {
    const warn = sinon.stub(logger, "warn");
    try {
      process.env[ENV_VAR] = "30000";
      expect(discovery.getFunctionDiscoveryTimeout()).to.equal(30_000_000);
      expect(warn).to.have.been.calledWithMatch(/30000ms/);
    } finally {
      warn.restore();
    }
  });
});
