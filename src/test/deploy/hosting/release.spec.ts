import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../../../hosting/api";
import { Context } from "../../../deploy/hosting/context";
import * as convertConfigPkg from "../../../deploy/hosting/convertConfig";

import { release } from "../../../deploy/hosting/release";
import { last } from "../../../utils";

describe("release", () => {
  const PROJECT = "fake-project";
  const SITE = "my-site";
  const VERSION = "it/ends/up/like/this/version-id";
  const FAKE_CONFIG = {};

  let updateVersionStub: sinon.SinonStub;
  let createReleaseStub: sinon.SinonStub;

  beforeEach(() => {
    updateVersionStub = sinon.stub(api, "updateVersion").rejects("updateVersion unstubbed");
    createReleaseStub = sinon.stub(api, "createRelease").rejects("createRelease unstubbed");
    sinon.stub(convertConfigPkg, "convertConfig").resolves(FAKE_CONFIG);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("with no Hosting deploys", () => {
    it("should bail", async () => {
      await release({ projectId: "foo" }, {}, {});

      expect(updateVersionStub).to.have.been.not.called;
      expect(createReleaseStub).to.have.been.not.called;
    });
  });

  describe("a single site", () => {
    const CONTEXT: Context = {
      projectId: PROJECT,
      hosting: {
        deploys: [{ config: { site: SITE }, version: VERSION }],
      },
    };

    const UPDATE: Partial<api.Version> = {
      status: "FINALIZED",
      config: FAKE_CONFIG,
    };

    it("should update a version and make a release", async () => {
      updateVersionStub.resolves({});
      createReleaseStub.resolves({});

      await release(CONTEXT, {}, {});

      expect(updateVersionStub).to.have.been.calledOnceWithExactly(
        SITE,
        last(VERSION.split("/")),
        UPDATE,
      );
      expect(createReleaseStub).to.have.been.calledOnceWithExactly(SITE, "live", VERSION, {});
    });

    it("should update a version and make a release with a message", async () => {
      updateVersionStub.resolves({});
      createReleaseStub.resolves({});

      await release(CONTEXT, { message: "hello world" }, {});

      expect(updateVersionStub).to.have.been.calledOnceWithExactly(
        SITE,
        last(VERSION.split("/")),
        UPDATE,
      );
      expect(createReleaseStub).to.have.been.calledOnceWithExactly(SITE, "live", VERSION, {
        message: "hello world",
      });
    });
  });

  describe("multiple sites", () => {
    const CONTEXT: Context = {
      projectId: PROJECT,
      hosting: {
        deploys: [
          { config: { site: SITE }, version: VERSION },
          { config: { site: `${SITE}-2` }, version: `${VERSION}-2` },
        ],
      },
    };

    const UPDATE: Partial<api.Version> = {
      status: "FINALIZED",
      config: FAKE_CONFIG,
    };

    it("should update a version and make a release", async () => {
      updateVersionStub.resolves({});
      createReleaseStub.resolves({});

      await release(CONTEXT, {}, {});

      expect(updateVersionStub).to.have.been.calledTwice;
      expect(updateVersionStub).to.have.been.calledWithExactly(
        SITE,
        last(VERSION.split("/")),
        UPDATE,
      );
      expect(updateVersionStub).to.have.been.calledWithExactly(
        `${SITE}-2`,
        `${last(VERSION.split("/"))}-2`,
        UPDATE,
      );
      expect(createReleaseStub).to.have.been.calledTwice;
      expect(createReleaseStub).to.have.been.calledWithExactly(SITE, "live", VERSION, {});
      expect(createReleaseStub).to.have.been.calledWithExactly(
        `${SITE}-2`,
        "live",
        `${VERSION}-2`,
        {},
      );
    });
  });

  describe("to a hosting channel", () => {
    const CHANNEL = "my-channel";
    const CONTEXT: Context = {
      projectId: PROJECT,
      hostingChannel: CHANNEL,
      hosting: {
        deploys: [{ config: { site: SITE }, version: VERSION }],
      },
    };

    const UPDATE: Partial<api.Version> = {
      status: "FINALIZED",
      config: FAKE_CONFIG,
    };

    it("should update a version and make a release", async () => {
      updateVersionStub.resolves({});
      createReleaseStub.resolves({});

      await release(CONTEXT, {}, {});

      expect(updateVersionStub).to.have.been.calledOnceWithExactly(
        SITE,
        last(VERSION.split("/")),
        UPDATE,
      );
      expect(createReleaseStub).to.have.been.calledOnceWithExactly(SITE, CHANNEL, VERSION, {});
    });
  });
});
