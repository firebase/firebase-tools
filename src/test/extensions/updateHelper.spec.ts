import * as _ from "lodash";
import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../error";
import * as updateHelper from "../../extensions/updateHelper";
import * as prompt from "../../prompt";
import * as extensionsHelper from "../../extensions/extensionsHelper";
import * as resolveSource from "../../extensions/resolveSource";
import * as extensionsApi from "../../extensions/extensionsApi";

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
  author: { authorName: "Tester" },
  contributors: [{ authorName: "Tester 2" }],
  billingRequired: true,
  sourceUrl: "test.com",
  params: [],
};

const SOURCE = {
  name: "projects/firebasemods/sources/new-test-source",
  packageUri: "https://firebase-fake-bucket.com",
  hash: "1234567",
  spec: SPEC,
};

const EXTENSION_VERSION = {
  name: "publishers/test-publisher/extensions/test/versions/0.2.0",
  ref: "test-publisher/test@0.2.0",
  spec: SPEC,
  state: "PUBLISHED",
  hash: "abcdefg",
  createTime: "2020-06-30T00:21:06.722782Z",
};

const REGISTRY_ENTRY = {
  name: "test",
  labels: {
    latest: "0.2.0",
    minRequired: "0.1.1",
  },
  versions: {
    "0.1.0": "projects/firebasemods/sources/2kd",
    "0.1.1": "projects/firebasemods/sources/xyz",
    "0.1.2": "projects/firebasemods/sources/123",
    "0.2.0": "projects/firebasemods/sources/abc",
  },
  updateWarnings: {
    ">0.1.0 <0.2.0": [
      {
        from: "0.1.0",
        description:
          "Starting Jan 15, HTTP functions will be private by default. [Learn more](https://someurl.com)",
        action:
          "After updating, it is highly recommended that you switch your Cloud Scheduler jobs to <b>PubSub</b>",
      },
    ],
    ">=0.2.0": [
      {
        from: "0.1.0",
        description:
          "Starting Jan 15, HTTP functions will be private by default. [Learn more](https://someurl.com)",
        action:
          "After updating, you must switch your Cloud Scheduler jobs to <b>PubSub</b>, otherwise your extension will stop running.",
      },
      {
        from: ">0.1.0",
        description:
          "Starting Jan 15, HTTP functions will be private by default. [Learn more](https://someurl.com)",
        action:
          "If you have not already done so during a previous update, after updating, you must switch your Cloud Scheduler jobs to <b>PubSub</b>, otherwise your extension will stop running.",
      },
    ],
  },
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

  describe("updateFromLocalSource", () => {
    let promptStub: sinon.SinonStub;
    let createSourceStub: sinon.SinonStub;
    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      createSourceStub = sinon.stub(extensionsHelper, "createSourceFromLocation");
    });

    afterEach(() => {
      promptStub.restore();
      createSourceStub.restore();
    });

    it("should return the correct source name for a valid local source", async () => {
      promptStub.resolves(true);
      createSourceStub.resolves(SOURCE);
      const name = await updateHelper.updateFromLocalSource(
        "test-project",
        "test-instance",
        ".",
        SPEC,
        SPEC.name
      );
      expect(name).to.equal(SOURCE.name);
    });
    it("should throw an error for an invalid source", async () => {
      promptStub.resolves(true);
      createSourceStub.throwsException("Invalid source");
      await expect(
        updateHelper.updateFromLocalSource("test-project", "test-instance", ".", SPEC, SPEC.name)
      ).to.to.be.rejectedWith(FirebaseError, "Unable to update from the source");
    });
    it("should not update if the update warning is not confirmed", async () => {
      promptStub.resolves(false);
      createSourceStub.resolves(SOURCE);
      await expect(
        updateHelper.updateFromLocalSource("test-project", "test-instance", ".", SPEC, SPEC.name)
      ).to.be.rejectedWith(FirebaseError, "Update cancelled.");
    });
  }).timeout(2500);

  describe("updateFromUrlSource", () => {
    let promptStub: sinon.SinonStub;
    let createSourceStub: sinon.SinonStub;
    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      createSourceStub = sinon.stub(extensionsHelper, "createSourceFromLocation");
    });

    afterEach(() => {
      promptStub.restore();
      createSourceStub.restore();
    });
    it("should return the correct source name for a valid url source", async () => {
      promptStub.resolves(true);
      createSourceStub.resolves(SOURCE);
      const name = await updateHelper.updateFromUrlSource(
        "test-project",
        "test-instance",
        "https://valid-source.tar.gz",
        SPEC,
        SPEC.name
      );
      expect(name).to.equal(SOURCE.name);
    });
    it("should throw an error for an invalid source", async () => {
      promptStub.resolves(true);
      createSourceStub.throws("Invalid source");
      await expect(
        updateHelper.updateFromUrlSource(
          "test-project",
          "test-instance",
          "https://valid-source.tar.gz",
          SPEC,
          SPEC.name
        )
      ).to.be.rejectedWith(FirebaseError, "Unable to update from the source");
    });
    it("should not update if the update warning is not confirmed", async () => {
      promptStub.resolves(false);
      createSourceStub.resolves(SOURCE);
      await expect(
        updateHelper.updateFromUrlSource(
          "test-project",
          "test-instance",
          "https://valid-source.tar.gz",
          SPEC,
          SPEC.name
        )
      ).to.be.rejectedWith(FirebaseError, "Update cancelled.");
    });
  }).timeout(2500);

  describe("updateToVersionFromPublisherSource", () => {
    let promptStub: sinon.SinonStub;
    let createSourceStub: sinon.SinonStub;
    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      createSourceStub = sinon.stub(extensionsApi, "getExtensionVersion");
    });

    afterEach(() => {
      promptStub.restore();
      createSourceStub.restore();
    });
    it("should return the correct source name for a valid published extension version source", async () => {
      promptStub.resolves(true);
      createSourceStub.resolves(EXTENSION_VERSION);
      const name = await updateHelper.updateToVersionFromPublisherSource(
        "test-instance",
        "test-publisher/test@0.2.0",
        SPEC,
        SPEC.name
      );
      expect(name).to.equal(EXTENSION_VERSION.name);
    });
    it("should throw an error for an invalid source", async () => {
      promptStub.resolves(true);
      createSourceStub.throws(Error("NOT FOUND"));
      await expect(
        updateHelper.updateToVersionFromPublisherSource(
          "test-instance",
          "test-publisher/test@1.2.3",
          SPEC,
          SPEC.name
        )
      ).to.be.rejectedWith("NOT FOUND");
    });
    it("should not update if the update warning is not confirmed", async () => {
      promptStub.resolves(false);
      createSourceStub.resolves(EXTENSION_VERSION);
      await expect(
        updateHelper.updateToVersionFromPublisherSource(
          "test-instance",
          "test-publisher/test@0.2.0",
          SPEC,
          SPEC.name
        )
      ).to.be.rejectedWith(FirebaseError, "Update cancelled.");
    });
  }).timeout(2500);

  describe("updateFromPublisherSource", () => {
    let promptStub: sinon.SinonStub;
    let createSourceStub: sinon.SinonStub;
    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      createSourceStub = sinon.stub(extensionsApi, "getExtensionVersion");
    });

    afterEach(() => {
      promptStub.restore();
      createSourceStub.restore();
    });
    it("should return the correct source name for the latest published extension source", async () => {
      promptStub.resolves(true);
      createSourceStub.resolves(EXTENSION_VERSION);
      const name = await updateHelper.updateToVersionFromPublisherSource(
        "test-instance",
        "test-publisher/test",
        SPEC,
        SPEC.name
      );
      expect(name).to.equal(EXTENSION_VERSION.name);
    });
    it("should throw an error for an invalid source", async () => {
      promptStub.resolves(true);
      createSourceStub.throws(Error("NOT FOUND"));
      await expect(
        updateHelper.updateToVersionFromPublisherSource(
          "test-instance",
          "test-publisher/test",
          SPEC,
          SPEC.name
        )
      ).to.be.rejectedWith("NOT FOUND");
    });
    it("should not update if the update warning is not confirmed", async () => {
      promptStub.resolves(false);
      createSourceStub.resolves(EXTENSION_VERSION);
      await expect(
        updateHelper.updateToVersionFromPublisherSource(
          "test-instance",
          "test-publisher/test",
          SPEC,
          SPEC.name
        )
      ).to.be.rejectedWith(FirebaseError, "Update cancelled.");
    });
  }).timeout(2500);

  describe("updateToVersionFromRegistry", () => {
    let promptStub: sinon.SinonStub;
    let registryEntryStub: sinon.SinonStub;
    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      registryEntryStub = sinon.stub(resolveSource, "resolveRegistryEntry");
    });

    afterEach(() => {
      promptStub.restore();
      registryEntryStub.restore();
    });
    it("should return the correct source name for a valid published source", async () => {
      promptStub.resolves(true);
      registryEntryStub.resolves(REGISTRY_ENTRY);
      const name = await updateHelper.updateToVersionFromRegistry(
        "test-instance",
        SPEC,
        SPEC.name,
        "0.1.2"
      );
      expect(name).to.equal("projects/firebasemods/sources/123");
    });
    it("should throw an error for an invalid source", async () => {
      promptStub.resolves(true);
      registryEntryStub.throws("Unable to find extension source");
      await expect(
        updateHelper.updateToVersionFromRegistry("test-instance", SPEC, SPEC.name, "0.1.1")
      ).to.be.rejectedWith(FirebaseError, "Cannot find the latest version of this extension.");
    });
    it("should not update if the update warning is not confirmed", async () => {
      promptStub.resolves(false);
      registryEntryStub.resolves(REGISTRY_ENTRY);
      await expect(
        updateHelper.updateToVersionFromRegistry("test-instance", SPEC, SPEC.name, "0.1.2")
      ).to.be.rejectedWith(FirebaseError, "Update cancelled.");
    });
    it("should not update if version given less than min version required", async () => {
      registryEntryStub.resolves(REGISTRY_ENTRY);
      await expect(
        updateHelper.updateToVersionFromRegistry("test-instance", SPEC, SPEC.name, "0.1.0")
      ).to.be.rejectedWith(FirebaseError, "is less than the minimum version required");
    });
  }).timeout(2500);

  describe("updateFromRegistry", () => {
    let promptStub: sinon.SinonStub;
    let registryEntryStub: sinon.SinonStub;
    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      registryEntryStub = sinon.stub(resolveSource, "resolveRegistryEntry");
    });

    afterEach(() => {
      promptStub.restore();
      registryEntryStub.restore();
    });
    it("should return the correct source name for a valid published source", async () => {
      promptStub.resolves(true);
      registryEntryStub.resolves(REGISTRY_ENTRY);
      const name = await updateHelper.updateFromRegistry("test-instance", SPEC, SPEC.name);
      expect(name).to.equal("projects/firebasemods/sources/abc");
    });
    it("should throw an error for an invalid source", async () => {
      promptStub.resolves(true);
      registryEntryStub.throws("Unable to find extension source");
      await expect(
        updateHelper.updateFromRegistry("test-instance", SPEC, SPEC.name)
      ).to.be.rejectedWith(FirebaseError, "Cannot find the latest version of this extension.");
    });
    it("should not update if the update warning is not confirmed", async () => {
      promptStub.resolves(false);
      registryEntryStub.resolves(REGISTRY_ENTRY);
      await expect(
        updateHelper.updateFromRegistry("test-instance", SPEC, SPEC.name)
      ).to.be.rejectedWith(FirebaseError, "Update cancelled.");
    });
  }).timeout(2500);
});
