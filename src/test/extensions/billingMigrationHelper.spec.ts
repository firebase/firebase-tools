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
        nodejsMigrationHelper.displayNode10CreateBillingNotice(newSpec, true)
      ).to.be.rejectedWith(FirebaseError, "Cancelled");
    });
  });
});
