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

import * as utils from "../utils";

describe("api", () => {
  beforeEach(() => {
    // The api module resolves env var statically so we need to
    // do lazy imports and clear the import each time.
    delete require.cache[require.resolve("../api")];
  });

  afterEach(() => {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIRESTORE_URL;

    // This is dirty, but utils keeps stateful overrides and we need to clear it
    utils.envOverrides.length = 0;
  });

  after(() => {
    delete require.cache[require.resolve("../api")];
  });

  it("should override with FIRESTORE_URL", () => {
    process.env.FIRESTORE_URL = "http://foobar.com";

    const api = require("../api");
    expect(api.firestoreOrigin).to.eq("http://foobar.com");
  });

  it("should prefer FIRESTORE_EMULATOR_HOST to FIRESTORE_URL", () => {
    process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
    process.env.FIRESTORE_URL = "http://foobar.com";

    const api = require("../api");
    expect(api.firestoreOriginOrEmulator).to.eq("http://localhost:8080");
  });
});
