import { expect } from "chai";
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
    ) as Promise<never>;
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

describe("getFunctionDiscoveryTimeout", () => {
  const ENV_VAR = "FUNCTIONS_DISCOVERY_TIMEOUT";
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV_VAR];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = original;
    }
  });

  it("returns 0 when unset", () => {
    delete process.env[ENV_VAR];
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
