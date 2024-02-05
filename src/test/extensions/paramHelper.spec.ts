import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";

import { FirebaseError } from "../../error";
import { ExtensionSpec, Param, ParamType } from "../../extensions/types";
import * as extensionsHelper from "../../extensions/extensionsHelper";
import * as paramHelper from "../../extensions/paramHelper";
import * as prompt from "../../prompt";
import { cloneDeep } from "../../utils";

const PROJECT_ID = "test-proj";
const INSTANCE_ID = "ext-instance";
const TEST_PARAMS: Param[] = [
  {
    param: "A_PARAMETER",
    label: "Param",
    type: ParamType.STRING,
    required: true,
  },
  {
    param: "ANOTHER_PARAMETER",
    label: "Another Param",
    default: "default",
    type: ParamType.STRING,
    required: true,
  },
];

const TEST_PARAMS_2: Param[] = [
  {
    param: "ANOTHER_PARAMETER",
    label: "Another Param",
    type: ParamType.STRING,
    default: "default",
  },
  {
    param: "NEW_PARAMETER",
    label: "New Param",
    type: ParamType.STRING,
    default: "${PROJECT_ID}",
  },
  {
    param: "THIRD_PARAMETER",
    label: "3",
    type: ParamType.STRING,
    default: "default",
  },
];
const TEST_PARAMS_3: Param[] = [
  {
    param: "A_PARAMETER",
    label: "Param",
    type: ParamType.STRING,
  },
  {
    param: "ANOTHER_PARAMETER",
    label: "Another Param",
    default: "default",
    type: ParamType.STRING,
    description: "Something new",
    required: false,
  },
];

const SPEC: ExtensionSpec = {
  name: "test",
  version: "0.1.0",
  roles: [],
  resources: [],
  sourceUrl: "test.com",
  params: TEST_PARAMS,
  systemParams: [],
};

describe("paramHelper", () => {
  describe(`${paramHelper.getBaseParamBindings.name}`, () => {
    it("should extract the baseValue param bindings", () => {
      const input = {
        pokeball: {
          baseValue: "pikachu",
          local: "local",
        },
        greatball: {
          baseValue: "eevee",
        },
      };
      const output = paramHelper.getBaseParamBindings(input);
      expect(output).to.eql({
        pokeball: "pikachu",
        greatball: "eevee",
      });
    });
  });

  describe(`${paramHelper.buildBindingOptionsWithBaseValue.name}`, () => {
    it("should build given baseValue values", () => {
      const input = {
        pokeball: "pikachu",
        greatball: "eevee",
      };
      const output = paramHelper.buildBindingOptionsWithBaseValue(input);
      expect(output).to.eql({
        pokeball: {
          baseValue: "pikachu",
        },
        greatball: {
          baseValue: "eevee",
        },
      });
    });
  });

  describe("getParams", () => {
    let promptStub: sinon.SinonStub;

    beforeEach(() => {
      sinon.stub(fs, "readFileSync").returns("");
      sinon.stub(extensionsHelper, "getFirebaseProjectParams").resolves({ PROJECT_ID });
      promptStub = sinon.stub(prompt, "promptOnce").resolves("user input");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should prompt the user for params", async () => {
      const params = await paramHelper.getParams({
        projectId: PROJECT_ID,
        paramSpecs: TEST_PARAMS,
        instanceId: INSTANCE_ID,
      });

      expect(params).to.eql({
        A_PARAMETER: { baseValue: "user input" },
        ANOTHER_PARAMETER: { baseValue: "user input" },
      });

      expect(promptStub).to.have.been.calledTwice;
      expect(promptStub.firstCall.args[0]).to.eql({
        default: undefined,
        message: "Enter a value for Param:",
        name: "A_PARAMETER",
        type: "input",
      });
      expect(promptStub.secondCall.args[0]).to.eql({
        default: "default",
        message: "Enter a value for Another Param:",
        name: "ANOTHER_PARAMETER",
        type: "input",
      });
    });
  });

  describe("promptForNewParams", () => {
    let promptStub: sinon.SinonStub;

    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      sinon.stub(extensionsHelper, "getFirebaseProjectParams").resolves({ PROJECT_ID });
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should prompt the user for any params in the new spec that are not in the current one", async () => {
      promptStub.resolves("user input");
      const newSpec = cloneDeep(SPEC);
      newSpec.params = TEST_PARAMS_2;

      const newParams = await paramHelper.promptForNewParams({
        spec: SPEC,
        newSpec,
        currentParams: {
          A_PARAMETER: "value",
          ANOTHER_PARAMETER: "value",
        },
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
      });

      const expected = {
        ANOTHER_PARAMETER: { baseValue: "value" },
        NEW_PARAMETER: { baseValue: "user input" },
        THIRD_PARAMETER: { baseValue: "user input" },
      };
      expect(newParams).to.eql(expected);
      expect(promptStub.callCount).to.equal(2);
      expect(promptStub.firstCall.args).to.eql([
        {
          default: "test-proj",
          message: "Enter a value for New Param:",
          name: "NEW_PARAMETER",
          type: "input",
        },
      ]);
      expect(promptStub.secondCall.args).to.eql([
        {
          default: "default",
          message: "Enter a value for 3:",
          name: "THIRD_PARAMETER",
          type: "input",
        },
      ]);
    });

    it("should prompt for params that are not currently populated", async () => {
      promptStub.resolves("user input");
      const newSpec = cloneDeep(SPEC);
      newSpec.params = TEST_PARAMS_2;

      const newParams = await paramHelper.promptForNewParams({
        spec: SPEC,
        newSpec,
        currentParams: {
          A_PARAMETER: "value",
          // ANOTHER_PARAMETER is not populated
        },
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
      });

      const expected = {
        ANOTHER_PARAMETER: { baseValue: "user input" },
        NEW_PARAMETER: { baseValue: "user input" },
        THIRD_PARAMETER: { baseValue: "user input" },
      };
      expect(newParams).to.eql(expected);
    });

    it("should map LOCATION to system param location and not prompt for it", async () => {
      promptStub.resolves("user input");
      const oldSpec = cloneDeep(SPEC);
      const newSpec = cloneDeep(SPEC);
      oldSpec.params = [
        {
          param: "LOCATION",
          label: "",
        },
      ];
      newSpec.params = [];
      newSpec.systemParams = [
        {
          param: "firebaseextensions.v1beta.function/location",
          label: "",
        },
      ];

      const newParams = await paramHelper.promptForNewParams({
        spec: oldSpec,
        newSpec,
        currentParams: {
          LOCATION: "us-east1",
        },
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
      });

      const expected = {
        "firebaseextensions.v1beta.function/location": { baseValue: "us-east1" },
      };
      expect(newParams).to.eql(expected);
      expect(promptStub).not.to.have.been.called;
    });

    it("should not prompt the user for params that did not change type or param", async () => {
      promptStub.resolves("Fail");
      const newSpec = cloneDeep(SPEC);
      newSpec.params = TEST_PARAMS_3;

      const newParams = await paramHelper.promptForNewParams({
        spec: SPEC,
        newSpec,
        currentParams: {
          A_PARAMETER: "value",
          ANOTHER_PARAMETER: "value",
        },
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
      });

      const expected = {
        ANOTHER_PARAMETER: { baseValue: "value" },
        A_PARAMETER: { baseValue: "value" },
      };
      expect(newParams).to.eql(expected);
      expect(promptStub).not.to.have.been.called;
    });

    it("should populate the spec with the default value if it is returned by prompt", async () => {
      promptStub.onFirstCall().resolves("test-proj");
      promptStub.onSecondCall().resolves("user input");
      const newSpec = cloneDeep(SPEC);
      newSpec.params = TEST_PARAMS_2;

      const newParams = await paramHelper.promptForNewParams({
        spec: SPEC,
        newSpec,
        currentParams: {
          A_PARAMETER: "value",
          ANOTHER_PARAMETER: "value",
        },
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
      });

      const expected = {
        ANOTHER_PARAMETER: { baseValue: "value" },
        NEW_PARAMETER: { baseValue: "test-proj" },
        THIRD_PARAMETER: { baseValue: "user input" },
      };
      expect(newParams).to.eql(expected);
      expect(promptStub.callCount).to.equal(2);
      expect(promptStub.firstCall.args).to.eql([
        {
          default: "test-proj",
          message: "Enter a value for New Param:",
          name: "NEW_PARAMETER",
          type: "input",
        },
      ]);
      expect(promptStub.secondCall.args).to.eql([
        {
          default: "default",
          message: "Enter a value for 3:",
          name: "THIRD_PARAMETER",
          type: "input",
        },
      ]);
    });

    it("shouldn't prompt if there are no new params", async () => {
      promptStub.resolves("Fail");
      const newSpec = cloneDeep(SPEC);

      const newParams = await paramHelper.promptForNewParams({
        spec: SPEC,
        newSpec,
        currentParams: {
          A_PARAMETER: "value",
          ANOTHER_PARAMETER: "value",
        },
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
      });

      const expected = {
        ANOTHER_PARAMETER: { baseValue: "value" },
        A_PARAMETER: { baseValue: "value" },
      };
      expect(newParams).to.eql(expected);
      expect(promptStub).not.to.have.been.called;
    });

    it("should exit if a prompt fails", async () => {
      promptStub.rejects(new FirebaseError("this is an error"));
      const newSpec = cloneDeep(SPEC);
      newSpec.params = TEST_PARAMS_2;

      await expect(
        paramHelper.promptForNewParams({
          spec: SPEC,
          newSpec,
          currentParams: {
            A_PARAMETER: "value",
            ANOTHER_PARAMETER: "value",
          },
          projectId: PROJECT_ID,
          instanceId: INSTANCE_ID,
        }),
      ).to.be.rejectedWith(FirebaseError, "this is an error");
      // Ensure that we don't continue prompting if one fails
      expect(promptStub).to.have.been.calledOnce;
    });
  });
});
