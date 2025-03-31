import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";

import { FirebaseError } from "../error";
import { ExtensionSpec, Param, ParamType } from "./types";
import * as extensionsHelper from "./extensionsHelper";
import * as paramHelper from "./paramHelper";
import * as promptImport from "../prompt";
import { cloneDeep } from "../utils";

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
    let prompt: sinon.SinonStubbedInstance<typeof promptImport>;

    beforeEach(() => {
      sinon.stub(fs, "readFileSync").returns("");
      sinon.stub(extensionsHelper, "getFirebaseProjectParams").resolves({ PROJECT_ID });
      prompt = sinon.stub(promptImport);
      prompt.input.resolves("user input");
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

      expect(prompt.input).to.have.been.calledTwice;
      expect(prompt.input.firstCall.args[0]).to.eql({
        default: undefined,
        message: "Enter a value for Param:",
      });
      expect(prompt.input.secondCall.args[0]).to.eql({
        default: "default",
        message: "Enter a value for Another Param:",
      });
    });
  });

  describe("promptForNewParams", () => {
    let prompt: sinon.SinonStubbedInstance<typeof promptImport>;

    beforeEach(() => {
      prompt = sinon.stub(promptImport);
      prompt.input.rejects("Unexpected input call");
      prompt.confirm.rejects("Unexpected confirm call");
      prompt.select.rejects("Unexpected select call");
      sinon.stub(extensionsHelper, "getFirebaseProjectParams").resolves({ PROJECT_ID });
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should prompt the user for any params in the new spec that are not in the current one", async () => {
      prompt.input.resolves("user input");
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
      expect(prompt.input).to.have.been.called.calledTwice;
      expect(prompt.input.firstCall.args).to.eql([
        {
          default: "test-proj",
          message: "Enter a value for New Param:",
        },
      ]);
      expect(prompt.input.secondCall.args).to.eql([
        {
          default: "default",
          message: "Enter a value for 3:",
        },
      ]);
    });

    it("should prompt for params that are not currently populated", async () => {
      prompt.input.resolves("user input");
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
      expect(prompt.input).not.to.have.been.called;
    });

    it("should not prompt the user for params that did not change type or param", async () => {
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
      expect(prompt.input).not.to.have.been.called;
    });

    it("should populate the spec with the default value if it is returned by prompt", async () => {
      prompt.input.onFirstCall().resolves("test-proj");
      prompt.input.onSecondCall().resolves("user input");
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
      expect(prompt.input).to.be.calledTwice;
      expect(prompt.input.firstCall.args).to.eql([
        {
          default: "test-proj",
          message: "Enter a value for New Param:",
        },
      ]);
      expect(prompt.input.secondCall.args).to.eql([
        {
          default: "default",
          message: "Enter a value for 3:",
        },
      ]);
    });

    it("shouldn't prompt if there are no new params", async () => {
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
      expect(prompt.input).not.to.have.been.called;
    });

    it("should exit if a prompt fails", async () => {
      prompt.input.rejects(new FirebaseError("this is an error"));
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
      expect(prompt.input).to.have.been.calledOnce;
    });
  });
});
