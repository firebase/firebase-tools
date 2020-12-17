"use strict";

import * as _ from "lodash";
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
      const expected = _.join([question, storageDescription, datastoreDescription], "\n");

      getRoleStub.onFirstCall().resolves(storageRole);
      getRoleStub.onSecondCall().resolves(datastoreRole);

      const actual = askUserForConsent.formatDescription(extensionName, projectId, roles);

      return expect(actual).to.eventually.deep.equal(expected);
    });
  });
});
