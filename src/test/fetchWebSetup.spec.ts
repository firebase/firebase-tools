import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import { configstore } from "../configstore";
import { fetchWebSetup, getCachedWebSetup } from "../fetchWebSetup";
import { firebaseApiOrigin } from "../api";
import { FirebaseError } from "../error";

describe("fetchWebSetup module", () => {
  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    expect(nock.isDone()).to.be.true;
  });

  describe("fetchWebSetup", () => {
    let configSetStub: sinon.SinonStub;

    beforeEach(() => {
      sinon.stub(configstore, "get");
      configSetStub = sinon.stub(configstore, "set").returns();
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should fetch the web app config", async () => {
      const projectId = "foo";
      nock(firebaseApiOrigin)
        .get(`/v1beta1/projects/${projectId}/webApps/-/config`)
        .reply(200, { some: "config" });

      const config = await fetchWebSetup({ project: projectId });

      expect(config).to.deep.equal({ some: "config" });
    });

    it("should store the fetched config", async () => {
      const projectId = "projectId";
      nock(firebaseApiOrigin)
        .get(`/v1beta1/projects/${projectId}/webApps/-/config`)
        .reply(200, { projectId, some: "config" });

      await fetchWebSetup({ project: projectId });

      expect(configSetStub).to.have.been.calledOnceWith("webconfig", {
        [projectId]: {
          projectId,
          some: "config",
        },
      });
      expect(nock.isDone()).to.be.true;
    });

    it("should throw an error if the request fails", async () => {
      const projectId = "foo";
      nock(firebaseApiOrigin)
        .get(`/v1beta1/projects/${projectId}/webApps/-/config`)
        .reply(404, { error: "Not Found" });

      await expect(fetchWebSetup({ project: projectId })).to.eventually.be.rejectedWith(
        FirebaseError,
        "Not Found",
      );
    });

    it("should return a fake config for a demo project id", async () => {
      const projectId = "demo-project-1234";
      await expect(fetchWebSetup({ project: projectId })).to.eventually.deep.equal({
        projectId: "demo-project-1234",
        databaseURL: "https://demo-project-1234.firebaseio.com",
        storageBucket: "demo-project-1234.appspot.com",
        apiKey: "fake-api-key",
        authDomain: "demo-project-1234.firebaseapp.com",
      });
    });
  });

  describe("getCachedWebSetup", () => {
    let configGetStub: sinon.SinonStub;

    beforeEach(() => {
      sinon.stub(configstore, "set").returns();
      configGetStub = sinon.stub(configstore, "get");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should return no config if none is cached", () => {
      configGetStub.returns(undefined);

      const config = getCachedWebSetup({ project: "foo" });

      expect(config).to.be.undefined;
    });

    it("should return a stored config", () => {
      const projectId = "projectId";
      configGetStub.returns({ [projectId]: { project: projectId, some: "config" } });

      const config = getCachedWebSetup({ project: projectId });

      expect(config).to.be.deep.equal({ project: projectId, some: "config" });
    });
  });
});
