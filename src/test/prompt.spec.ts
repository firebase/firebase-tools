import { expect } from "chai";
import * as sinon from "sinon";
import * as inquirer from "inquirer";

import * as FirebaseError from "../error";
import * as prompt from "../prompt";

describe("prompt", () => {
  let inquirerStub: sinon.SinonStub;
  const PROMPT_RESPONSES = {
    some: "fool",
    with: "values",
  };

  beforeEach(() => {
    // Stub inquirer to return a set of fake answers.
    inquirerStub = sinon.stub(inquirer, "prompt").resolves(PROMPT_RESPONSES);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("prompt", () => {
    it("should error if questions are asked in nonInteractive environment", async () => {
      const o = { nonInteractive: true };
      const qs: prompt.Question[] = [{ name: "foo" }];

      expect(prompt.prompt(o, qs)).to.be.rejectedWith(FirebaseError, /required.+non\-interactive/);
    });

    it("should utilize inquirer to prompt for the questions", async () => {
      const qs: prompt.Question[] = [
        {
          name: "foo",
          message: "this is a test",
        },
      ];

      await prompt.prompt({}, qs);

      expect(inquirerStub).calledOnceWithExactly(qs);
    });

    it("should add the new values to the options object", async () => {
      const options = { hello: "world" };
      const qs: prompt.Question[] = [
        {
          name: "foo",
          message: "this is a test",
        },
      ];

      await prompt.prompt(options, qs);

      expect(options).to.deep.equal(Object.assign({ hello: "world" }, PROMPT_RESPONSES));
    });
  });

  describe("promptOnce", () => {
    it("should provide a name if one is not provided", async () => {
      await prompt.promptOnce({ message: "foo" });

      expect(inquirerStub).calledOnceWith([{ name: "question", message: "foo" }]);
    });

    it("should return the value for the given name", async () => {
      const r = await prompt.promptOnce({ name: "some" });

      expect(r).to.equal("fool");
      expect(inquirerStub).calledOnce;
    });
  });

  describe("convertLabeledListChoices", () => {
    it("should return a list of the same size", () => {
      const cs = [
        {
          checked: false,
          name: "foo",
          label: "Label for foo",
        },
        {
          checked: true,
          name: "bar",
          label: "Label for bar",
        },
      ];

      expect(prompt.convertLabeledListChoices([])).to.have.length(0);
      expect(prompt.convertLabeledListChoices(cs)).to.have.length(2);
    });
  });

  describe("listLabelToValue", () => {
    const CHOICES = [
      {
        name: "foo",
        label: "this is foo",
        checked: false,
      },
      {
        name: "bar",
        label: "this is bar",
        checked: false,
      },
    ];

    it("should return the value for a name given a label", () => {
      expect(prompt.listLabelToValue("this is bar", CHOICES)).to.equal("bar");
    });

    it("should return empty-string for an unknown label", () => {
      expect(prompt.listLabelToValue("this is baz", CHOICES)).to.equal("");
    });
  });
});
