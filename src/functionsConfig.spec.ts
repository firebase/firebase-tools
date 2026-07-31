import { expect } from "chai";
import nock from "./test/helpers/nock";

import * as functionsConfig from "./functionsConfig";
import { FirebaseError } from "./error";

const FAKE_PROJECT_ID = "my-project";

describe("config.parseSetArgs", () => {
  it("should throw if a reserved namespace is used", () => {
    expect(() => {
      functionsConfig.parseSetArgs(["firebase.something=else"]);
    }).to.throw("reserved namespace");
  });

  it("should throw if a malformed arg is used", () => {
    expect(() => {
      functionsConfig.parseSetArgs(["foo.bar=baz", "qux"]);
    }).to.throw("must be in key=val format");
  });

  it("should parse args into correct config and variable IDs", () => {
    expect(functionsConfig.parseSetArgs(["foo.bar.faz=val"])).to.deep.eq([
      {
        configId: "foo",
        varId: "bar/faz",
        val: "val",
      },
    ]);
  });
});

describe("config.parseUnsetArgs", () => {
  it("should throw if a reserved namespace is used", () => {
    expect(() => {
      functionsConfig.parseUnsetArgs(["firebase.something"]);
    }).to.throw("reserved namespace");
  });

  it("should parse args into correct config and variable IDs", () => {
    expect(functionsConfig.parseUnsetArgs(["foo.bar.faz"])).to.deep.eq([
      {
        configId: "foo",
        varId: "bar/faz",
      },
    ]);
  });
});

describe("config.getFirebaseConfig", () => {
  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    expect(nock.isDone()).to.be.true;
  });

  it("should return the admin SDK config on success", async () => {
    nock("https://firebase.googleapis.com")
      .get(`/v1beta1/projects/${FAKE_PROJECT_ID}/adminSdkConfig`)
      .reply(200, { projectId: FAKE_PROJECT_ID });

    const config = await functionsConfig.getFirebaseConfig({ project: FAKE_PROJECT_ID });

    expect(config).to.deep.eq({ projectId: FAKE_PROJECT_ID });
  });

  it("should throw a friendly error when the project doesn't have Firebase enabled", async () => {
    nock("https://firebase.googleapis.com")
      .get(`/v1beta1/projects/${FAKE_PROJECT_ID}/adminSdkConfig`)
      .reply(404, { error: { message: "Requested entity was not found." } });

    await expect(functionsConfig.getFirebaseConfig({ project: FAKE_PROJECT_ID }))
      .to.be.rejectedWith(FirebaseError, /doesn't have Firebase enabled/)
      .and.eventually.have.property("status", 404);
  });

  it("should rethrow non-404 errors as-is", async () => {
    nock("https://firebase.googleapis.com")
      .get(`/v1beta1/projects/${FAKE_PROJECT_ID}/adminSdkConfig`)
      .reply(500, { error: { message: "Internal error" } });

    await expect(functionsConfig.getFirebaseConfig({ project: FAKE_PROJECT_ID }))
      .to.be.rejectedWith(FirebaseError, "Internal error")
      .and.eventually.have.property("status", 500);
  });
});
