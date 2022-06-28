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
import * as _ from "lodash";
import * as sinon from "sinon";

import { FirebaseError } from "../../../error";
import * as firestore from "../../../init/features/firestore";
import * as indexes from "../../../init/features/firestore/indexes";
import * as rules from "../../../init/features/firestore/rules";
import * as requirePermissions from "../../../requirePermissions";
import * as apiEnabled from "../../../ensureApiEnabled";
import * as checkDatabaseType from "../../../firestore/checkDatabaseType";

describe("firestore", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let checkApiStub: sinon.SinonStub;
  let checkDbTypeStub: sinon.SinonStub;

  beforeEach(() => {
    checkApiStub = sandbox.stub(apiEnabled, "check");
    checkDbTypeStub = sandbox.stub(checkDatabaseType, "checkDatabaseType");

    // By default, mock Firestore enabled in Native mode
    checkApiStub.returns(true);
    checkDbTypeStub.returns("CLOUD_FIRESTORE");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("doSetup", () => {
    it("should require access, set up rules and indices, ensure cloud resource location set", async () => {
      const requirePermissionsStub = sandbox
        .stub(requirePermissions, "requirePermissions")
        .resolves();
      const initIndexesStub = sandbox.stub(indexes, "initIndexes").resolves();
      const initRulesStub = sandbox.stub(rules, "initRules").resolves();

      const setup = { config: {}, projectId: "my-project-123", projectLocation: "us-central1" };

      await firestore.doSetup(setup, {}, {});

      expect(requirePermissionsStub).to.have.been.calledOnce;
      expect(initRulesStub).to.have.been.calledOnce;
      expect(initIndexesStub).to.have.been.calledOnce;
      expect(_.get(setup, "config.firestore")).to.deep.equal({});
    });

    it("should error when cloud resource location is not set", async () => {
      const setup = { config: {}, projectId: "my-project-123" };

      await expect(firestore.doSetup(setup, {}, {})).to.eventually.be.rejectedWith(
        FirebaseError,
        "Cloud resource location is not set"
      );
    });

    it("should error when the firestore API is not enabled", async () => {
      checkApiStub.returns(false);

      const setup = { config: {}, projectId: "my-project-123" };

      await expect(firestore.doSetup(setup, {}, {})).to.eventually.be.rejectedWith(
        FirebaseError,
        "It looks like you haven't used Cloud Firestore"
      );
    });

    it("should error when firestore is in the wrong mode", async () => {
      checkApiStub.returns(true);
      checkDbTypeStub.returns("CLOUD_DATASTORE_COMPATIBILITY");

      const setup = { config: {}, projectId: "my-project-123" };

      await expect(firestore.doSetup(setup, {}, {})).to.eventually.be.rejectedWith(
        FirebaseError,
        "It looks like this project is using Cloud Datastore or Cloud Firestore in Datastore mode."
      );
    });
  });
});
