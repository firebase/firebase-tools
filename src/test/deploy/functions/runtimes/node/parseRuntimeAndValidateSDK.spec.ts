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

// Have to disable this because no @types/cjson available
// eslint-disable-next-line
const cjson = require("cjson");

import { FirebaseError } from "../../../../../error";
import * as runtime from "../../../../../deploy/functions/runtimes/node/parseRuntimeAndValidateSDK";

describe("getRuntimeChoice", () => {
  const sandbox = sinon.createSandbox();
  let cjsonStub: sinon.SinonStub;

  beforeEach(() => {
    cjsonStub = sandbox.stub(cjson, "load");
  });

  afterEach(() => {
    sandbox.restore();
  });

  context("when the runtime is set in firebase.json", () => {
    it("should error if runtime field is set to node 6", () => {
      expect(() => {
        runtime.getRuntimeChoice("path/to/source", "nodejs6");
      }).to.throw(runtime.UNSUPPORTED_NODE_VERSION_FIREBASE_JSON_MSG);
    });

    it("should error if runtime field is set to node 8", () => {
      expect(() => {
        runtime.getRuntimeChoice("path/to/source", "nodejs8");
      }).to.throw(runtime.UNSUPPORTED_NODE_VERSION_FIREBASE_JSON_MSG);
    });

    it("should return node 10 if runtime field is set to node 10", () => {
      expect(runtime.getRuntimeChoice("path/to/source", "nodejs10")).to.equal("nodejs10");
    });

    it("should return node 12 if runtime field is set to node 12", () => {
      expect(runtime.getRuntimeChoice("path/to/source", "nodejs12")).to.equal("nodejs12");
    });

    it("should return node 14 if runtime field is set to node 14", () => {
      expect(runtime.getRuntimeChoice("path/to/source", "nodejs14")).to.equal("nodejs14");
    });

    it("should return node 16 if runtime field is set to node 16", () => {
      expect(runtime.getRuntimeChoice("path/to/source", "nodejs16")).to.equal("nodejs16");
    });

    it("should throw error if unsupported node version set", () => {
      expect(() => runtime.getRuntimeChoice("path/to/source", "nodejs11")).to.throw(
        FirebaseError,
        runtime.UNSUPPORTED_NODE_VERSION_FIREBASE_JSON_MSG
      );
    });
  });

  context("when the runtime is not set in firebase.json", () => {
    it("should error if engines field is set to node 6", () => {
      cjsonStub.returns({ engines: { node: "6" } });

      expect(() => {
        runtime.getRuntimeChoice("path/to/source", "");
      }).to.throw(runtime.UNSUPPORTED_NODE_VERSION_PACKAGE_JSON_MSG);
    });

    it("should error if engines field is set to node 8", () => {
      cjsonStub.returns({ engines: { node: "8" } });

      expect(() => {
        runtime.getRuntimeChoice("path/to/source", "");
      }).to.throw(runtime.UNSUPPORTED_NODE_VERSION_PACKAGE_JSON_MSG);
    });

    it("should return node 10 if engines field is set to node 10", () => {
      cjsonStub.returns({ engines: { node: "10" } });

      expect(runtime.getRuntimeChoice("path/to/source", "")).to.equal("nodejs10");
    });

    it("should return node 12 if engines field is set to node 12", () => {
      cjsonStub.returns({ engines: { node: "12" } });

      expect(runtime.getRuntimeChoice("path/to/source", "")).to.equal("nodejs12");
    });

    it("should return node 14 if engines field is set to node 14", () => {
      cjsonStub.returns({ engines: { node: "14" } });

      expect(runtime.getRuntimeChoice("path/to/source", "")).to.equal("nodejs14");
    });

    it("should return node 16 if engines field is set to node 16", () => {
      cjsonStub.returns({ engines: { node: "16" } });

      expect(runtime.getRuntimeChoice("path/to/source", "")).to.equal("nodejs16");
    });

    it("should print warning when firebase-functions version is below 2.0.0", () => {
      cjsonStub.returns({ engines: { node: "16" } });

      runtime.getRuntimeChoice("path/to/source", "");
    });

    it("should not throw error if user's SDK version fails to be fetched", () => {
      cjsonStub.returns({ engines: { node: "10" } });
      // Intentionally not setting SDKVersionStub so it can fail to be fetched.
      expect(runtime.getRuntimeChoice("path/to/source", "")).to.equal("nodejs10");
    });

    it("should throw error if unsupported node version set", () => {
      cjsonStub.returns({
        engines: { node: "11" },
      });
      expect(() => runtime.getRuntimeChoice("path/to/source", "")).to.throw(
        FirebaseError,
        runtime.UNSUPPORTED_NODE_VERSION_PACKAGE_JSON_MSG
      );
    });
  });
});
