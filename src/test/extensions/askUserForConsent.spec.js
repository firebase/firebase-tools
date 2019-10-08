"use strict";

const _ = require("lodash");
const clc = require("cli-color");

const chai = require("chai");
chai.use(require("chai-as-promised"));
const sinon = require("sinon");

const askUserForConsent = require("../../extensions/askUserForConsent");

const expect = chai.expect;

describe("askUserForConsent", function() {
  describe("_formatDescription", function() {
    beforeEach(function() {
      sinon.stub(askUserForConsent, "_retrieveRoleInfo");
      askUserForConsent._retrieveRoleInfo.rejects("UNDEFINED TEST BEHAVIOR");
    });

    afterEach(function() {
      askUserForConsent._retrieveRoleInfo.restore();
    });

    const partialSpec = { roles: [{ role: "storage.objectAdmin" }, { role: "datastore.viewer" }] };

    it("format description correctly", function() {
      const extensionName = "extension-for-test";
      const projectId = "project-for-test";
      const question = `${clc.bold(
        extensionName
      )} will be granted the following access to project ${clc.bold(projectId)}`;
      const storageDescription = "- Storage Object Admin (Full control of GCS objects.)";
      const datastoreDescription =
        "- Cloud Datastore Viewer (Read access to all Cloud Datastore resources.)";
      const expected = _.join([question, storageDescription, datastoreDescription], "\n");

      askUserForConsent._retrieveRoleInfo.onFirstCall().resolves(storageDescription);
      askUserForConsent._retrieveRoleInfo.onSecondCall().resolves(datastoreDescription);

      const actual = askUserForConsent._formatDescription(
        extensionName,
        projectId,
        partialSpec.roles
      );

      return expect(actual).to.eventually.deep.equal(expected);
    });
  });
});
