import * as _ from "lodash";
import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../error";
import * as updateHelper from "../../extensions/updateHelper";
import * as prompt from "../../prompt";

const SPEC = {
  name: "test",
  displayName: "Old",
  description: "descriptive",
  version: "1.0.0",
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
  author: { authorName: "Tester" },
  contributors: [{ authorName: "Tester 2" }],
  billingRequired: true,
  sourceUrl: "test.com",
  params: [],
};

describe("updateHelper", () => {
  describe("displayChangesNoInput", () => {
    it("should display changes to display name", () => {
      const newSpec = _.cloneDeep(SPEC);
      newSpec.displayName = "new";

      const loggedLines = updateHelper.displayChangesNoInput(SPEC, newSpec);

      const expected = [
        "",
        "**Display Name:**",
        "\u001b[31m- Old\u001b[39m",
        "\u001b[32m+ new\u001b[39m",
      ];
      expect(loggedLines).to.eql(expected);
    });

    it("should display changes to description", () => {
      const newSpec = _.cloneDeep(SPEC);
      newSpec.description = "even better";

      const loggedLines = updateHelper.displayChangesNoInput(SPEC, newSpec);

      const expected = [
        "",
        "**Description:**",
        "\u001b[31m- descriptive\u001b[39m",
        "\u001b[32m+ even better\u001b[39m",
      ];
      expect(loggedLines).to.eql(expected);
    });

    it("should notify the user if billing is no longer required", () => {
      const newSpec = _.cloneDeep(SPEC);
      newSpec.billingRequired = false;

      const loggedLines = updateHelper.displayChangesNoInput(SPEC, newSpec);

      const expected = ["", "**Billing is no longer required for this extension.**"];
      expect(loggedLines).to.eql(expected);
    });

    it("should display nothing if no relevant fields were changed", () => {
      const newSpec = _.cloneDeep(SPEC);
      newSpec.license = "drivers";

      const loggedLines = updateHelper.displayChangesNoInput(SPEC, newSpec);

      const expected: string[] = [];
      expect(loggedLines).to.eql(expected);
    });
  });

  describe("displayChangesRequiringConfirmation", () => {
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

      expect(updateHelper.displayChangesRequiringConfirmation(SPEC, newSpec)).not.to.be.rejected;

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

      expect(updateHelper.displayChangesRequiringConfirmation(SPEC, newSpec)).not.to.be.rejected;

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

      expect(updateHelper.displayChangesRequiringConfirmation(SPEC, newSpec)).not.to.be.rejected;

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

      expect(updateHelper.displayChangesRequiringConfirmation(SPEC, newSpec)).not.to.be.rejected;

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

      expect(updateHelper.displayChangesRequiringConfirmation(oldSpec, SPEC)).not.to.be.rejected;

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

      expect(updateHelper.displayChangesRequiringConfirmation(SPEC, newSpec)).to.be.rejectedWith(
        FirebaseError,
        "Without explicit consent for the change to license, we cannot update this extension instance."
      );

      expect(promptStub.callCount).to.equal(1);
    });

    it("should error if the user doesn't give consent", () => {
      promptStub.resolves(false);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.license = "new";

      expect(updateHelper.displayChangesRequiringConfirmation(SPEC, newSpec)).to.be.rejectedWith(
        FirebaseError,
        "Without explicit consent for the change to license, we cannot update this extension instance."
      );
    });

    it("shouldn't prompt the user if no changes require confirmation", async () => {
      promptStub.resolves(false);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.version = "1.1.0";

      await updateHelper.displayChangesRequiringConfirmation(SPEC, newSpec);

      expect(promptStub).not.to.have.been.called;
    });
  });
});
