/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { expect } from "chai";
import * as sinon from "sinon";
import * as inquirer from "inquirer";

import { FirebaseError } from "../error";
import * as prompt from "../prompt";

describe("prompt", () => {
  let inquirerStub: sinon.SinonStub;
  const PROMPT_RESPONSES = {
    lint: true,
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
        /required.+non-interactive/
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
  });
});
