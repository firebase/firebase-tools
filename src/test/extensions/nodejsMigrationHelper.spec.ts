import * as _ from "lodash";
import { expect } from "chai";
import * as sinon from "sinon";

import * as nodejsMigrationHelper from "../../extensions/nodejsMigrationHelper";
import * as prompt from "../../prompt";

const NO_RUNTIME_SPEC = {
  name: "test",
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

describe("nodejsMigrationHelper", () => {
  let promptStub: sinon.SinonStub;
  beforeEach(() => {
    promptStub = sinon.stub(prompt, "promptOnce");
    promptStub.resolves(true);
  });

  afterEach(() => {
    promptStub.restore();
  });

  describe("displayNodejsBillingNotice", () => {
    it("should notify the user if the runtime is being upgraded to nodejs10", () => {
      const curSpec = _.cloneDeep(NODE8_SPEC);
      const newSpec = _.cloneDeep(NODE10_SPEC);

      expect(nodejsMigrationHelper.displayNodejsBillingNotice(newSpec, curSpec)).not.to.be.rejected;
      expect(promptStub.callCount).to.equal(1);
    });

    it("should notify the user if the runtime is being upgraded to nodejs10 implicitly", () => {
      const curSpec = _.cloneDeep(NO_RUNTIME_SPEC);
      const newSpec = _.cloneDeep(NODE10_SPEC);

      expect(nodejsMigrationHelper.displayNodejsBillingNotice(newSpec, curSpec)).not.to.be.rejected;
      expect(promptStub.callCount).to.equal(1);
    });

    it("should notify the user if the new spec requires nodejs10 runtime", () => {
      const newSpec = _.cloneDeep(NODE10_SPEC);

      expect(nodejsMigrationHelper.displayNodejsBillingNotice(newSpec)).not.to.be.rejected;
      expect(promptStub.callCount).to.equal(1);
    });

    it("should display nothing if the runtime isn't being upgraded to nodejs10", () => {
      const curSpec = _.cloneDeep(NODE8_SPEC);
      const newSpec = _.cloneDeep(NODE8_SPEC);

      expect(nodejsMigrationHelper.displayNodejsBillingNotice(newSpec, curSpec)).not.to.be.rejected;
      expect(promptStub.callCount).to.equal(0);
    });

    it("should display nothing if the runtime was already on nodejs10", () => {
      const curSpec = _.cloneDeep(NODE10_SPEC);
      const newSpec = _.cloneDeep(NODE10_SPEC);

      expect(nodejsMigrationHelper.displayNodejsBillingNotice(newSpec, curSpec)).not.to.be.rejected;
      expect(promptStub.callCount).to.equal(0);
    });
  });
});
