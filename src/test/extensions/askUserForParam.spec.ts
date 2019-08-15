import { expect } from "chai";
import * as sinon from "sinon";

import {
  ask,
  askForParam,
  checkResponse,
  getInquirerDefault,
} from "../../extensions/askUserForParam";
import * as utils from "../../utils";
import * as prompt from "../../prompt";
import { ParamType } from "../../extensions/modsApi";
import * as modsHelper from "../../extensions/modsHelper";

describe("askUserForParam", () => {
  const testSpec = {
    param: "NAME",
    type: ParamType.STRING,
    label: "Name",
    default: "Lauren",
    validationRegex: "^[a-z,A-Z]*$",
  };

  describe("checkResponse", () => {
    let logWarningSpy: sinon.SinonSpy;
    beforeEach(() => {
      logWarningSpy = sinon.spy(utils, "logWarning");
    });

    afterEach(() => {
      logWarningSpy.restore();
    });

    it("should return false if required variable is not set", () => {
      expect(
        checkResponse("", {
          param: "param",
          label: "fill in the blank!",
          type: ParamType.STRING,
          required: true,
        })
      ).to.equal(false);
      expect(
        logWarningSpy.calledWith("You are required to enter a value for this question")
      ).to.equal(true);
    });

    it("should return false if regex validation fails", () => {
      expect(
        checkResponse("123", {
          param: "param",
          label: "fill in the blank!",
          type: ParamType.STRING,
          validationRegex: "foo",
          required: true,
        })
      ).to.equal(false);
      const expectedWarning = `123 is not a valid answer since it does not fit the regular expression "foo"`;
      expect(logWarningSpy.calledWith(expectedWarning)).to.equal(true);
    });

    it("should use custom validation error message if provided", () => {
      const message = "please enter a word with foo in it";
      expect(
        checkResponse("123", {
          param: "param",
          label: "fill in the blank!",
          type: ParamType.STRING,
          validationRegex: "foo",
          validationErrorMessage: message,
          required: true,
        })
      ).to.equal(false);
      expect(logWarningSpy.calledWith(message)).to.equal(true);
    });

    it("should return true if all conditions pass", () => {
      expect(
        checkResponse("123", {
          param: "param",
          label: "fill in the blank!",
          type: ParamType.STRING,
        })
      ).to.equal(true);
      expect(logWarningSpy.called).to.equal(false);
    });

    it("should return false if an invalid choice is selected", () => {
      expect(
        checkResponse("???", {
          param: "param",
          label: "pick one!",
          type: ParamType.SELECT,
          options: [{ value: "aaa" }, { value: "bbb" }, { value: "ccc" }],
        })
      ).to.equal(false);
    });

    it("should return true if an valid choice is selected", () => {
      expect(
        checkResponse("aaa", {
          param: "param",
          label: "pick one!",
          type: ParamType.SELECT,
          options: [{ value: "aaa" }, { value: "bbb" }, { value: "ccc" }],
        })
      ).to.equal(true);
    });

    it("should return false if multiple invalid choices are selected", () => {
      expect(
        checkResponse("d,e,f", {
          param: "param",
          label: "pick multiple!",
          type: ParamType.MULTISELECT,
          options: [{ value: "aaa" }, { value: "bbb" }, { value: "ccc" }],
        })
      ).to.equal(false);
    });

    it("should return true if one valid choice is selected", () => {
      expect(
        checkResponse("ccc", {
          param: "param",
          label: "pick multiple!",
          type: ParamType.MULTISELECT,
          options: [{ value: "aaa" }, { value: "bbb" }, { value: "ccc" }],
        })
      ).to.equal(true);
    });

    it("should return true if multiple valid choices are selected", () => {
      expect(
        checkResponse("aaa,bbb,ccc", {
          param: "param",
          label: "pick multiple!",
          type: ParamType.MULTISELECT,
          options: [{ value: "aaa" }, { value: "bbb" }, { value: "ccc" }],
        })
      ).to.equal(true);
    });

    it("should return false if regex validation fails for one of the choices picked", () => {
      expect(
        checkResponse("123,345,abc", {
          param: "param",
          label: "pick multiple!",
          type: ParamType.MULTISELECT,
          options: [{ value: "123" }, { value: "345" }, { value: "abc" }],
          validationRegex: `^\\d{3}$`,
          required: true,
        })
      ).to.equal(false);
      const expectedWarning = `abc is not a valid answer since it does not fit the regular expression "^\\d{3}$"`;
      expect(logWarningSpy.called).to.equal(true);
    });

    it("should return true if regex validation passes for all of the choices picked", () => {
      expect(
        checkResponse("123,345,567", {
          param: "param",
          label: "pick multiple!",
          type: ParamType.MULTISELECT,
          options: [{ value: "123" }, { value: "345" }, { value: "567" }],
          validationRegex: `^\\d{3}$`,
          required: true,
        })
      ).to.equal(true);
    });
  });

  describe("getInquirerDefaults", () => {
    it("should return the label of the option whose value matches the default", () => {
      const options = [{ label: "lab", value: "val" }, { label: "lab1", value: "val1" }];
      const def = "val1";

      const res = getInquirerDefault(options, def);

      expect(res).to.equal("lab1");
    });

    it("should return the value of the default option if it doesnt have a label", () => {
      const options = [{ label: "lab", value: "val" }, { value: "val1" }];
      const def = "val1";

      const res = getInquirerDefault(options, def);

      expect(res).to.equal("val1");
    });

    it("should return an empty string if a default option is not found", () => {
      const options = [{ label: "lab", value: "val" }, { value: "val1" }];
      const def = "val2";

      const res = getInquirerDefault(options, def);

      expect(res).to.equal("");
    });
  });
  describe("askForParam", () => {
    let promptStub: sinon.SinonStub;

    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      promptStub.onCall(0).returns("Invalid123");
      promptStub.onCall(1).returns("InvalidStill123");
      promptStub.onCall(2).returns("ValidName");
    });

    afterEach(() => {
      promptStub.restore();
    });

    it("should keep prompting user until valid input is given", async () => {
      await askForParam(testSpec);
      expect(promptStub.calledThrice).to.be.true;
    });
  });

  describe("ask", () => {
    let subVarSpy: sinon.SinonSpy;
    let promptStub: sinon.SinonStub;

    beforeEach(() => {
      subVarSpy = sinon.spy(modsHelper, "substituteParams");
      promptStub = sinon.stub(prompt, "promptOnce");
      promptStub.returns("ValidName");
    });

    afterEach(() => {
      subVarSpy.restore();
      promptStub.restore();
    });

    it("should call substituteParams with the right parameters", async () => {
      const spec = [testSpec];
      const firebaseProjectVars = { PROJECT_ID: "my-project" };
      await ask(spec, firebaseProjectVars);
      expect(subVarSpy.calledWith(spec, firebaseProjectVars)).to.be.true;
    });
  });
});
