import * as _ from "lodash";
import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../error";
import * as nodejsMigrationHelper from "../../extensions/billingMigrationHelper";
import * as prompt from "../../prompt";

const NO_RUNTIME_SPEC = {
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
};

const NODE8_SPEC = {
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
};

const NODE10_SPEC = {
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
};

describe("billingMigrationHelper", () => {
  let promptStub: sinon.SinonStub;
  beforeEach(() => {
    promptStub = sinon.stub(prompt, "promptOnce");
  });

  afterEach(() => {
    promptStub.restore();
  });

  describe("displayCreateBillingNotice", () => {
    it("should notify the user if the runtime requires nodejs10", () => {
      promptStub.resolves(true);
      const newSpec = _.cloneDeep(NODE10_SPEC);

      expect(nodejsMigrationHelper.displayNode10CreateBillingNotice(newSpec, true)).not.to.be
        .rejected;
      expect(promptStub.callCount).to.equal(1);
    });

    it("should notify the user if the runtime does not require nodejs (explicit)", () => {
      promptStub.resolves(true);
      const newSpec = _.cloneDeep(NODE8_SPEC);

      expect(nodejsMigrationHelper.displayNode10CreateBillingNotice(newSpec, true)).not.to.be
        .rejected;
      expect(promptStub.callCount).to.equal(0);
    });

    it("should notify the user if the runtime does not require nodejs (implicit)", () => {
      promptStub.resolves(true);
      const newSpec = _.cloneDeep(NO_RUNTIME_SPEC);

      expect(nodejsMigrationHelper.displayNode10CreateBillingNotice(newSpec, true)).not.to.be
        .rejected;
      expect(promptStub.callCount).to.equal(0);
    });

    it("should error if the user doesn't give consent", () => {
      promptStub.resolves(false);
      const newSpec = _.cloneDeep(NODE10_SPEC);

      expect(
        nodejsMigrationHelper.displayNode10CreateBillingNotice(newSpec, true)
      ).to.be.rejectedWith(FirebaseError, "Cancelled");
    });
  });
});
