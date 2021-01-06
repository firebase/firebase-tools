import * as _ from "lodash";
import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../error";
import * as displayExtensionInfo from "../../extensions/displayExtensionInfo";
import * as prompt from "../../prompt";

const SPEC = {
  name: "test",
  displayName: "Old",
  description: "descriptive",
  version: "0.1.0",
  license: "MIT",
  apis: [
    { apiName: "api1", reason: "" },
    { apiName: "api2", reason: "" },
  ],
  roles: [
    { role: "role1", reason: "" },
    { role: "role2", reason: "" },
  ],
  resources: [
    { name: "resource1", type: "firebaseextensions.v1beta.function", description: "desc" },
    { name: "resource2", type: "other", description: "" },
  ],
  author: { authorName: "Tester", url: "firebase.google.com" },
  contributors: [{ authorName: "Tester 2" }],
  billingRequired: true,
  sourceUrl: "test.com",
  params: [],
};

describe("displayExtensionInfo", () => {
  describe("displayExtInfo", () => {
    it("should display info during install", () => {
      const loggedLines = displayExtensionInfo.displayExtInfo(SPEC.name, SPEC);
      const expected: string[] = [
        "**Name**: Old",
        "**Author**: Tester (**[firebase.google.com](firebase.google.com)**)",
        "**Description**: descriptive",
      ];
      expect(loggedLines).to.eql(expected);
    });
    it("should display additional information for a published extension", () => {
      const loggedLines = displayExtensionInfo.displayExtInfo(SPEC.name, SPEC, true);
      const expected: string[] = [
        "**Name**: Old",
        "**Author**: Tester (**[firebase.google.com](firebase.google.com)**)",
        "**Description**: descriptive",
        "**License**: MIT",
        "**Source code**: test.com",
      ];
      expect(loggedLines).to.eql(expected);
    });
  });
  describe("displayUpdateChangesNoInput", () => {
    it("should display changes to display name", () => {
      const newSpec = _.cloneDeep(SPEC);
      newSpec.displayName = "new";

      const loggedLines = displayExtensionInfo.displayUpdateChangesNoInput(SPEC, newSpec);

      const expected = ["", "**Name:**", "\u001b[31m- Old\u001b[39m", "\u001b[32m+ new\u001b[39m"];
      expect(loggedLines).to.include.members(expected);
    });

    it("should display changes to description", () => {
      const newSpec = _.cloneDeep(SPEC);
      newSpec.description = "even better";

      const loggedLines = displayExtensionInfo.displayUpdateChangesNoInput(SPEC, newSpec);

      const expected = [
        "",
        "**Description:**",
        "\u001b[31m- descriptive\u001b[39m",
        "\u001b[32m+ even better\u001b[39m",
      ];
      expect(loggedLines).to.include.members(expected);
    });

    it("should notify the user if billing is no longer required", () => {
      const newSpec = _.cloneDeep(SPEC);
      newSpec.billingRequired = false;

      const loggedLines = displayExtensionInfo.displayUpdateChangesNoInput(SPEC, newSpec);

      const expected = ["", "**Billing is no longer required for this extension.**"];
      expect(loggedLines).to.include.members(expected);
    });
  });

  describe("displayUpdateChangesRequiringConfirmation", () => {
    let promptStub: sinon.SinonStub;
    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
    });

    afterEach(() => {
      promptStub.restore();
    });

    it("should prompt for changes to license and continue if user gives consent", () => {
      promptStub.resolves(true);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.license = "To Kill";

      expect(displayExtensionInfo.displayUpdateChangesRequiringConfirmation(SPEC, newSpec)).not.to
        .be.rejected;

      expect(promptStub.callCount).to.equal(1);
      expect(promptStub.firstCall.args[0].message).to.contain("To Kill");
    });

    it("should prompt for changes to apis and continue if user gives consent", () => {
      promptStub.resolves(true);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.apis = [
        { apiName: "api2", reason: "" },
        { apiName: "api3", reason: "" },
      ];

      expect(displayExtensionInfo.displayUpdateChangesRequiringConfirmation(SPEC, newSpec)).not.to
        .be.rejected;

      expect(promptStub.callCount).to.equal(1);
      expect(promptStub.firstCall.args[0].message).to.contain("- api1");
      expect(promptStub.firstCall.args[0].message).to.contain("+ api3");
    });

    it("should prompt for changes to roles and continue if user gives consent", () => {
      promptStub.resolves(true);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.roles = [
        { role: "role2", reason: "" },
        { role: "role3", reason: "" },
      ];

      expect(displayExtensionInfo.displayUpdateChangesRequiringConfirmation(SPEC, newSpec)).not.to
        .be.rejected;

      expect(promptStub.callCount).to.equal(1);
      expect(promptStub.firstCall.args[0].message).to.contain("- role1");
      expect(promptStub.firstCall.args[0].message).to.contain("+ role3");
    });

    it("should prompt for changes to resources and continue if user gives consent", () => {
      promptStub.resolves(true);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.resources = [
        { name: "resource3", type: "firebaseextensions.v1beta.function", description: "new desc" },
        { name: "resource2", type: "other", description: "" },
      ];

      expect(displayExtensionInfo.displayUpdateChangesRequiringConfirmation(SPEC, newSpec)).not.to
        .be.rejected;

      expect(promptStub.callCount).to.equal(1);
      expect(promptStub.firstCall.args[0].message).to.contain("- resource1");
      expect(promptStub.firstCall.args[0].message).to.contain("desc");
      expect(promptStub.firstCall.args[0].message).to.contain("+ resource3");
      expect(promptStub.firstCall.args[0].message).to.contain("new desc");
    });

    it("should prompt for changes to resources and continue if user gives consent", () => {
      promptStub.resolves(true);
      const oldSpec = _.cloneDeep(SPEC);
      oldSpec.billingRequired = false;

      expect(displayExtensionInfo.displayUpdateChangesRequiringConfirmation(oldSpec, SPEC)).not.to
        .be.rejected;

      expect(promptStub.callCount).to.equal(1);
      expect(promptStub.firstCall.args[0].message).to.contain(
        "Billing is now required for the new version of this extension. Would you like to continue?"
      );
    });

    it("should exit if the user consents to one change but rejects another", () => {
      promptStub.resolves(true);
      promptStub.resolves(false);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.license = "New";
      newSpec.roles = [
        { role: "role2", reason: "" },
        { role: "role3", reason: "" },
      ];

      expect(
        displayExtensionInfo.displayUpdateChangesRequiringConfirmation(SPEC, newSpec)
      ).to.be.rejectedWith(
        FirebaseError,
        "Without explicit consent for the change to license, we cannot update this extension instance."
      );

      expect(promptStub.callCount).to.equal(1);
    });

    it("should error if the user doesn't give consent", () => {
      promptStub.resolves(false);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.license = "new";

      expect(
        displayExtensionInfo.displayUpdateChangesRequiringConfirmation(SPEC, newSpec)
      ).to.be.rejectedWith(
        FirebaseError,
        "Without explicit consent for the change to license, we cannot update this extension instance."
      );
    });

    it("shouldn't prompt the user if no changes require confirmation", async () => {
      promptStub.resolves(false);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.version = "1.1.0";

      await displayExtensionInfo.displayUpdateChangesRequiringConfirmation(SPEC, newSpec);

      expect(promptStub).not.to.have.been.called;
    });
  });
});
