import { expect } from "chai";
import nock from "./test/helpers/nock";

import * as functionsConfig from "./functionsConfig";
import { firebaseApiOrigin } from "./api";
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
    // Read isDone before cleaning, but clean before asserting, so a test that
    // fails before its interceptor is used doesn't leak it into the next test.
    const isDone = nock.isDone();
    nock.cleanAll();
    expect(isDone).to.equal(true, "all nock stubs should have been called");
  });

  it("should return the admin SDK config on success", async () => {
    nock(firebaseApiOrigin())
      .get(`/v1beta1/projects/${FAKE_PROJECT_ID}/adminSdkConfig`)
      .reply(200, { projectId: FAKE_PROJECT_ID });

    const config = await functionsConfig.getFirebaseConfig({ project: FAKE_PROJECT_ID });

    expect(config).to.deep.eq({ projectId: FAKE_PROJECT_ID });
  });

  it("should throw a friendly error on 404 that points at projects:addfirebase", async () => {
    nock(firebaseApiOrigin())
      .get(`/v1beta1/projects/${FAKE_PROJECT_ID}/adminSdkConfig`)
      .reply(404, { error: { message: "Requested entity was not found." } });

    const err = await expect(functionsConfig.getFirebaseConfig({ project: FAKE_PROJECT_ID })).to.be
      .rejected;

    expect(err).to.be.instanceOf(FirebaseError);
    expect(err.status).to.eq(404);
    expect(err.message).to.contain(`firebase projects:addfirebase ${FAKE_PROJECT_ID}`);
    // getFirebaseConfig also backs functions:delete, functions:export and ext:*,
    // so the message must not be phrased as a deploy failure.
    expect(err.message).to.not.contain("deploy");
  });

  it("should rethrow non-404 errors as-is", async () => {
    nock(firebaseApiOrigin())
      .get(`/v1beta1/projects/${FAKE_PROJECT_ID}/adminSdkConfig`)
      .reply(500, { error: { message: "Internal error" } });

    await expect(functionsConfig.getFirebaseConfig({ project: FAKE_PROJECT_ID }))
      .to.be.rejectedWith(FirebaseError, "Internal error")
      .and.eventually.have.property("status", 500);
  });
});
