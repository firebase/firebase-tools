import { expect } from "chai";
import * as yaml from "js-yaml";
import * as sinon from "sinon";
import * as nock from "nock";

import * as api from "../../../../../api";
import { FirebaseError } from "../../../../../error";
import * as discovery from "../../../../../deploy/functions/runtimes/discovery";
import * as build from "../../../../../deploy/functions/build";

const MIN_ENDPOINT = {
  entryPoint: "entrypoint",
  httpsTrigger: {},
};

const ENDPOINT: build.Endpoint = {
  ...MIN_ENDPOINT,
  platform: "gcfv2",
  project: "project",
  runtime: "nodejs16",
  region: [api.functionsDefaultRegion],
  serviceAccount: null,
};

const YAML_OBJ = {
  specVersion: "v1alpha1",
  endpoints: { id: MIN_ENDPOINT },
};

const YAML_TEXT = yaml.dump(YAML_OBJ);

const BUILD: build.Build = build.of({ id: ENDPOINT });

describe("yamlToBuild", () => {
  it("Accepts a valid v1alpha1 spec", () => {
    const parsed = discovery.yamlToBuild(
      YAML_OBJ,
      "project",
      api.functionsDefaultRegion,
      "nodejs16"
    );
    expect(parsed).to.deep.equal(BUILD);
  });

  it("Requires a spec version", () => {
    const flawed: Record<string, unknown> = { ...YAML_OBJ };
    delete flawed.specVersion;
    expect(() =>
      discovery.yamlToBuild(flawed, "project", api.functionsDefaultRegion, "nodejs16")
    ).to.throw(FirebaseError);
  });

  it("Throws on unknown spec versions", () => {
    const flawed = {
      ...YAML_OBJ,
      specVersion: "32767beta2",
    };
    expect(() =>
      discovery.yamlToBuild(flawed, "project", api.functionsDefaultRegion, "nodejs16")
    ).to.throw(FirebaseError);
  });
});

describe("detectFromYaml", () => {
  let readFileAsync: sinon.SinonStub;

  beforeEach(() => {
    readFileAsync = sinon.stub(discovery, "readFileAsync");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("succeeds when YAML can be found", async () => {
    readFileAsync.resolves(YAML_TEXT);

    await expect(
      discovery.detectFromYaml("directory", "project", "nodejs16")
    ).to.eventually.deep.equal(BUILD);
  });

  it("returns undefined when YAML cannot be found", async () => {
    readFileAsync.rejects({ code: "ENOENT" });

    await expect(discovery.detectFromYaml("directory", "project", "nodejs16")).to.eventually.equal(
      undefined
    );
  });
});

describe("detectFromPort", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  // This test requires us to launch node and load express.js. On my 16" MBP this takes
  // 600ms, which is dangerously close to the default limit of 1s. Increase limits so
  // that this doesn't flake even when running on slower machines experiencing hiccup
  it("passes as smoke test", async () => {
    nock("http://localhost:8080").get("/__/functions.yaml").times(20).replyWithError({
      message: "Still booting",
      code: "ECONNREFUSED",
    });

    nock("http://localhost:8080").get("/__/functions.yaml").reply(200, YAML_TEXT);

    const parsed = await discovery.detectFromPort(8080, "project", "nodejs16");
    expect(parsed).to.deep.equal(BUILD);
  });
});
