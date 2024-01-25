import { expect } from "chai";
import * as sinon from "sinon";
import * as inquirer from "inquirer";

import { FirebaseError } from "../error";
import * as prompt from "../prompt";

describe("prompt", () => {
  let inquirerStub: sinon.SinonStub;
  const PROMPT_RESPONSES = {
    lint: true,
    "lint/dint/mint": true,
    project: "the-best-project-ever",
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

      await expect(prompt.prompt(o, qs)).to.be.rejectedWith(
        FirebaseError,
        /required.+non-interactive/,
      );
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
      const r = await prompt.promptOnce({ name: "lint" });

      expect(r).to.equal(true);
      expect(inquirerStub).calledOnce;
    });

    it("should handle names with .'s", async () => {
      const r = await prompt.promptOnce({ name: "lint.dint.mint" });

      expect(r).to.equal(true);
      expect(inquirerStub).calledOnce;
    });
  });
});
