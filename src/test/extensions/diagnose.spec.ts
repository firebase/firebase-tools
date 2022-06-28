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
import * as sinon from "sinon";
import * as resourceManager from "../../gcp/resourceManager";
import * as pn from "../../getProjectNumber";
import * as diagnose from "../../extensions/diagnose";
import * as extensionsApi from "../../extensions/extensionsApi";
import * as prompt from "../../prompt";

const GOOD_BINDING = {
  role: "roles/firebasemods.serviceAgent",
  members: ["serviceAccount:service-123456@gcp-sa-firebasemods.iam.gserviceaccount.com"],
};

describe("diagnose", () => {
  let getIamStub: sinon.SinonStub;
  let setIamStub: sinon.SinonStub;
  let getProjectNumberStub: sinon.SinonStub;
  let promptOnceStub: sinon.SinonStub;
  let listInstancesStub: sinon.SinonStub;

  beforeEach(() => {
    getIamStub = sinon
      .stub(resourceManager, "getIamPolicy")
      .throws("unexpected call to resourceManager.getIamStub");
    setIamStub = sinon
      .stub(resourceManager, "setIamPolicy")
      .throws("unexpected call to resourceManager.setIamPolicy");
    getProjectNumberStub = sinon
      .stub(pn, "getProjectNumber")
      .throws("unexpected call to pn.getProjectNumber");
    promptOnceStub = sinon
      .stub(prompt, "promptOnce")
      .throws("unexpected call to prompt.promptOnce");
    listInstancesStub = sinon
      .stub(extensionsApi, "listInstances")
      .throws("unexpected call to extensionsApi.listInstances");

    getProjectNumberStub.resolves(123456);
    listInstancesStub.resolves([]);
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("should succeed when IAM policy is correct (no fix)", async () => {
    getIamStub.resolves({
      etag: "etag",
      version: 3,
      bindings: [GOOD_BINDING],
    });
    promptOnceStub.resolves(false);

    expect(await diagnose.diagnose("project_id")).to.be.true;

    expect(getIamStub).to.have.been.calledWith("project_id");
    expect(setIamStub).to.not.have.been.called;
  });

  it("should fail when project IAM policy missing extensions service agent (no fix)", async () => {
    getIamStub.resolves({
      etag: "etag",
      version: 3,
      bindings: [],
    });
    promptOnceStub.resolves(false);

    expect(await diagnose.diagnose("project_id")).to.be.false;

    expect(getIamStub).to.have.been.calledWith("project_id");
    expect(setIamStub).to.not.have.been.called;
  });

  it("should fix the project IAM policy by adding missing bindings", async () => {
    getIamStub.resolves({
      etag: "etag",
      version: 3,
      bindings: [],
    });
    setIamStub.resolves();
    promptOnceStub.resolves(true);

    expect(await diagnose.diagnose("project_id")).to.be.true;

    expect(getIamStub).to.have.been.calledWith("project_id");
    expect(setIamStub).to.have.been.calledWith(
      "project_id",
      {
        etag: "etag",
        version: 3,
        bindings: [GOOD_BINDING],
      },
      "bindings"
    );
  });
});
