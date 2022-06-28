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

import * as clc from "cli-color";
import * as chai from "chai";
chai.use(require("chai-as-promised"));
import * as sinon from "sinon";

import * as askUserForConsent from "../../extensions/askUserForConsent";
import * as iam from "../../gcp/iam";

const expect = chai.expect;

describe("askUserForConsent", () => {
  describe("formatDescription", () => {
    let getRoleStub: sinon.SinonStub;
    beforeEach(() => {
      getRoleStub = sinon.stub(iam, "getRole");
      getRoleStub.rejects("UNDEFINED TEST BEHAVIOR");
    });

    afterEach(() => {
      getRoleStub.restore();
    });
    const roles = ["storage.objectAdmin", "datastore.viewer"];

    it("format description correctly", () => {
      const extensionName = "extension-for-test";
      const projectId = "project-for-test";
      const question = `${clc.bold(
        extensionName
      )} will be granted the following access to project ${clc.bold(projectId)}`;
      const storageRole = {
        title: "Storage Object Admin",
        description: "Full control of GCS objects.",
      };
      const datastoreRole = {
        title: "Cloud Datastore Viewer",
        description: "Read access to all Cloud Datastore resources.",
      };
      const storageDescription = "- Storage Object Admin (Full control of GCS objects.)";
      const datastoreDescription =
        "- Cloud Datastore Viewer (Read access to all Cloud Datastore resources.)";
      const expected = [question, storageDescription, datastoreDescription].join("\n");

      getRoleStub.onFirstCall().resolves(storageRole);
      getRoleStub.onSecondCall().resolves(datastoreRole);

      const actual = askUserForConsent.formatDescription(extensionName, projectId, roles);

      return expect(actual).to.eventually.deep.equal(expected);
    });
  });
});
