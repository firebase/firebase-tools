/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
        "Not Found"
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
