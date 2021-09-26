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
      const loggedLines = displayExtensionInfo.displayExtInfo(SPEC.name, "", SPEC);
      const expected: string[] = ["**Name**: Old", "**Description**: descriptive"];
      expect(loggedLines).to.eql(expected);
    });
    it("should display additional information for a published extension", () => {
      const loggedLines = displayExtensionInfo.displayExtInfo(
        SPEC.name,
        "testpublisher",
        SPEC,
        true
      );
      const expected: string[] = [
        "**Name**: Old",
        "**Publisher**: testpublisher",
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

      expect(
        displayExtensionInfo.displayUpdateChangesRequiringConfirmation({
          spec: SPEC,
          newSpec,
          nonInteractive: false,
          force: false,
        })
      ).not.to.be.rejected;

      expect(promptStub.callCount).to.equal(1);
    });

    it("should prompt for changes to apis and continue if user gives consent", () => {
      promptStub.resolves(true);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.apis = [
        { apiName: "api2", reason: "" },
        { apiName: "api3", reason: "" },
      ];

      expect(
        displayExtensionInfo.displayUpdateChangesRequiringConfirmation({
          spec: SPEC,
          newSpec,
          nonInteractive: false,
          force: false,
        })
      ).not.to.be.rejected;

      expect(promptStub.callCount).to.equal(1);
    });

    it("should prompt for changes to roles and continue if user gives consent", () => {
      promptStub.resolves(true);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.roles = [
        { role: "role2", reason: "" },
        { role: "role3", reason: "" },
      ];

      expect(
        displayExtensionInfo.displayUpdateChangesRequiringConfirmation({
          spec: SPEC,
          newSpec,
          nonInteractive: false,
          force: false,
        })
      ).not.to.be.rejected;

      expect(promptStub.callCount).to.equal(1);
    });

    it("should prompt for changes to resources and continue if user gives consent", () => {
      promptStub.resolves(true);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.resources = [
        { name: "resource3", type: "firebaseextensions.v1beta.function", description: "new desc" },
        { name: "resource2", type: "other", description: "" },
      ];

      expect(
        displayExtensionInfo.displayUpdateChangesRequiringConfirmation({
          spec: SPEC,
          newSpec,
          nonInteractive: false,
          force: false,
        })
      ).not.to.be.rejected;

      expect(promptStub.callCount).to.equal(1);
    });

    it("should prompt for changes to resources and continue if user gives consent", () => {
      promptStub.resolves(true);
      const oldSpec = _.cloneDeep(SPEC);
      oldSpec.billingRequired = false;

      expect(
        displayExtensionInfo.displayUpdateChangesRequiringConfirmation({
          spec: oldSpec,
          newSpec: SPEC,
          nonInteractive: false,
          force: false,
        })
      ).not.to.be.rejected;

      expect(promptStub.callCount).to.equal(1);
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
        displayExtensionInfo.displayUpdateChangesRequiringConfirmation({
          spec: SPEC,
          newSpec,
          nonInteractive: false,
          force: false,
        })
      ).to.be.rejectedWith(
        FirebaseError,
        "Unable to update this extension instance without explicit consent for the change to 'License'"
      );

      expect(promptStub.callCount).to.equal(1);
    });

    it("should error if the user doesn't give consent", () => {
      promptStub.resolves(false);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.license = "new";

      expect(
        displayExtensionInfo.displayUpdateChangesRequiringConfirmation({
          spec: SPEC,
          newSpec,
          nonInteractive: false,
          force: false,
        })
      ).to.be.rejectedWith(
        FirebaseError,
        "Unable to update this extension instance without explicit consent for the change to 'License'."
      );
    });

    it("shouldn't prompt the user if no changes require confirmation", async () => {
      promptStub.resolves(false);
      const newSpec = _.cloneDeep(SPEC);
      newSpec.version = "1.1.0";

      await displayExtensionInfo.displayUpdateChangesRequiringConfirmation({
        spec: SPEC,
        newSpec,
        nonInteractive: false,
        force: false,
      });

      expect(promptStub).not.to.have.been.called;
    });
  });
});
