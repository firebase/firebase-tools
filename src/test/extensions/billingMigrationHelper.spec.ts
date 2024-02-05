import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../error";
import * as nodejsMigrationHelper from "../../extensions/billingMigrationHelper";
import * as prompt from "../../prompt";
import { ExtensionSpec } from "../../extensions/types";
import { cloneDeep } from "../../utils";

const NO_RUNTIME_SPEC: ExtensionSpec = {
  name: "test",
  specVersion: "v1beta",
  displayName: "Old",
  description: "descriptive",
  version: "1.0.0",
  license: "MIT",
  resources: [
    {
      name: "resource1",
      type: "firebaseextensions.v1beta.function",
      description: "desc",
      properties: {},
    },
  ],
  author: { authorName: "Tester" },
  contributors: [{ authorName: "Tester 2" }],
  billingRequired: true,
  sourceUrl: "test.com",
  params: [],
  systemParams: [],
};

const NODE8_SPEC: ExtensionSpec = {
  name: "test",
  specVersion: "v1beta",
  displayName: "Old",
  description: "descriptive",
  version: "1.0.0",
  license: "MIT",
  resources: [
    {
      name: "resource1",
      type: "firebaseextensions.v1beta.function",
      description: "desc",
      properties: { runtime: "nodejs8" },
    },
  ],
  author: { authorName: "Tester" },
  contributors: [{ authorName: "Tester 2" }],
  billingRequired: true,
  sourceUrl: "test.com",
  params: [],
  systemParams: [],
};

const NODE10_SPEC: ExtensionSpec = {
  name: "test",
  specVersion: "v1beta",
  displayName: "Old",
  description: "descriptive",
  version: "1.0.0",
  license: "MIT",
  resources: [
    {
      name: "resource1",
      type: "firebaseextensions.v1beta.function",
      description: "desc",
      properties: { runtime: "nodejs10" },
    },
  ],
  author: { authorName: "Tester" },
  contributors: [{ authorName: "Tester 2" }],
  billingRequired: true,
  sourceUrl: "test.com",
  params: [],
  systemParams: [],
};

describe("billingMigrationHelper", () => {
  let promptStub: sinon.SinonStub;
  beforeEach(() => {
    promptStub = sinon.stub(prompt, "promptOnce");
  });

  afterEach(() => {
    promptStub.restore();
  });

  describe("displayNode10CreateBillingNotice", () => {
    it("should notify the user if the runtime requires nodejs10", async () => {
      promptStub.resolves(true);
      const newSpec = cloneDeep(NODE10_SPEC);

      await expect(nodejsMigrationHelper.displayNode10CreateBillingNotice(newSpec, true)).not.to.be
        .rejected;
      expect(promptStub.callCount).to.equal(1);
    });

    it("should notify the user if the runtime does not require nodejs (explicit)", async () => {
      promptStub.resolves(true);
      const newSpec = cloneDeep(NODE8_SPEC);

      await expect(nodejsMigrationHelper.displayNode10CreateBillingNotice(newSpec, true)).not.to.be
        .rejected;
      expect(promptStub.callCount).to.equal(0);
    });

    it("should notify the user if the runtime does not require nodejs (implicit)", async () => {
      promptStub.resolves(true);
      const newSpec = cloneDeep(NO_RUNTIME_SPEC);

      await expect(nodejsMigrationHelper.displayNode10CreateBillingNotice(newSpec, true)).not.to.be
        .rejected;
      expect(promptStub.callCount).to.equal(0);
    });

    it("should error if the user doesn't give consent", async () => {
      promptStub.resolves(false);
      const newSpec = cloneDeep(NODE10_SPEC);

      await expect(
        nodejsMigrationHelper.displayNode10CreateBillingNotice(newSpec, true),
      ).to.be.rejectedWith(FirebaseError, "Cancelled");
    });
  });
});
