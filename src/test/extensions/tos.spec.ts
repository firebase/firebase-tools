import { expect } from "chai";
import * as nock from "nock";

import * as api from "../../api";
import * as tos from "../../extensions/tos";

describe("tos", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  const testProjectId = "test-proj";
  describe("getAppDeveloperTOSStatus", () => {
    it("should get app developer TOS", async () => {
      const t = testTOS("appdevtos", "1.0.0");
      nock(api.extensionsTOSOrigin).get(`/v1/projects/${testProjectId}/appdevtos`).reply(200, t);

      const appDevTos = await tos.getAppDeveloperTOSStatus(testProjectId);

      expect(appDevTos).to.deep.equal(t);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("getPublisherTOS", () => {
    it("should get publisher TOS", async () => {
      const t = testTOS("publishertos", "1.0.0");
      nock(api.extensionsTOSOrigin).get(`/v1/projects/${testProjectId}/publishertos`).reply(200, t);

      const pubTos = await tos.getPublisherTOSStatus(testProjectId);

      expect(pubTos).to.deep.equal(t);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("acceptAppDeveloperTOS", () => {
    it("should accept app dev TOS with no instance", async () => {
      const t = testTOS("appdevtos", "1.0.0");
      nock(api.extensionsTOSOrigin)
        .post(`/v1/projects/${testProjectId}/appdevtos:accept`)
        .reply(200, t);

      const appDevTos = await tos.acceptAppDeveloperTOS(testProjectId, "1.0.0");

      expect(appDevTos).to.deep.equal(t);
      expect(nock.isDone()).to.be.true;
    });

    it("should accept app dev TOS with an instance", async () => {
      const t = testTOS("appdevtos", "1.0.0");
      nock(api.extensionsTOSOrigin)
        .post(`/v1/projects/${testProjectId}/appdevtos:accept`)
        .reply(200, t);

      const appDevTos = await tos.acceptAppDeveloperTOS(testProjectId, "instanceId", "1.0.0");

      expect(appDevTos).to.deep.equal(t);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("acceptPublisherTOS", () => {
    it("should accept publisher TOS", async () => {
      const t = testTOS("publishertos", "1.0.0");
      nock(api.extensionsTOSOrigin)
        .post(`/v1/projects/${testProjectId}/publishertos:accept`)
        .reply(200, t);

      const pubTos = await tos.acceptPublisherTOS(testProjectId, "1.0.0");

      expect(pubTos).to.deep.equal(t);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("acceptLatestAppDeveloperTOS", () => {
    it("should prompt to accept the latest app dev TOS if it has not been accepted", async () => {
      const t = testTOS("appdevtos", "1.0.0");
      nock(api.extensionsTOSOrigin).get(`/v1/projects/${testProjectId}/appdevtos`).reply(200, t);
      nock(api.extensionsTOSOrigin)
        .post(`/v1/projects/${testProjectId}/appdevtos:accept`)
        .reply(200, t);

      const appDevTos = await tos.acceptLatestAppDeveloperTOS(
        {
          nonInteractive: true,
          force: true,
        },
        testProjectId,
        ["my-instance"],
      );

      expect(appDevTos).to.deep.equal([t]);
      expect(nock.isDone()).to.be.true;
    });

    it("should not prompt for the latest app dev TOS if it has already been accepted", async () => {
      const t = testTOS("appdevtos", "1.1.0", "1.1.0");
      nock(api.extensionsTOSOrigin).get(`/v1/projects/${testProjectId}/appdevtos`).reply(200, t);
      nock(api.extensionsTOSOrigin)
        .post(`/v1/projects/${testProjectId}/appdevtos:accept`)
        .reply(200, t);

      const appDevTos = await tos.acceptLatestAppDeveloperTOS(
        {
          nonInteractive: true,
          force: true,
        },
        testProjectId,
        ["my-instance"],
      );

      expect(appDevTos).to.deep.equal([t]);
      expect(nock.isDone()).to.be.true;
    });

    it("should accept the TOS once per instance", async () => {
      const t = testTOS("appdevtos", "1.1.0", "1.1.0");
      nock(api.extensionsTOSOrigin).get(`/v1/projects/${testProjectId}/appdevtos`).reply(200, t);
      nock(api.extensionsTOSOrigin)
        .post(`/v1/projects/${testProjectId}/appdevtos:accept`)
        .reply(200, t);
      nock(api.extensionsTOSOrigin)
        .post(`/v1/projects/${testProjectId}/appdevtos:accept`)
        .reply(200, t);

      const appDevTos = await tos.acceptLatestAppDeveloperTOS(
        {
          nonInteractive: true,
          force: true,
        },
        testProjectId,
        ["my-instance", "my-other-instance"],
      );

      expect(appDevTos).to.deep.equal([t, t]);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("acceptLatestPublisherTOS", () => {
    it("should prompt to accept the latest publisher TOS if it has not been accepted", async () => {
      const t = testTOS("publishertos", "1.0.0");
      nock(api.extensionsTOSOrigin).get(`/v1/projects/${testProjectId}/publishertos`).reply(200, t);
      nock(api.extensionsTOSOrigin)
        .post(`/v1/projects/${testProjectId}/publishertos:accept`)
        .reply(200, t);

      const publisherTos = await tos.acceptLatestPublisherTOS(
        {
          nonInteractive: true,
          force: true,
        },
        testProjectId,
      );

      expect(publisherTos).to.deep.equal(t);
      expect(nock.isDone()).to.be.true;
    });
  });

  it("should return the latest publisher TOS is it has already been accepted", async () => {
    const t = testTOS("publishertos", "1.1.0", "1.1.0");
    nock(api.extensionsTOSOrigin).get(`/v1/projects/${testProjectId}/publishertos`).reply(200, t);

    const publisherTos = await tos.acceptLatestPublisherTOS(
      {
        nonInteractive: true,
        force: true,
      },
      testProjectId,
    );

    expect(publisherTos).to.deep.equal(t);
    expect(nock.isDone()).to.be.true;
  });
});

function testTOS(tosName: string, latestVersion: string, lastAcceptedVersion?: string): tos.TOS {
  const t: tos.TOS = {
    name: `projects/test-project/${tosName}`,
    lastAcceptedTime: "11111",
    latestTosVersion: latestVersion,
  };
  if (lastAcceptedVersion) {
    t.lastAcceptedVersion = lastAcceptedVersion;
  }
  return t;
}
