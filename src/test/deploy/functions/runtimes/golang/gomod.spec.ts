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
import * as gomod from "../../../../../deploy/functions/runtimes/golang/gomod";
import * as go from "../../../../../deploy/functions/runtimes/golang";

const MOD_NAME = "acme.com/fucntions";
const GO_VERSION = "1.13";
const FUNCTIONS_MOD = "firebase.google.com/firebase-functions-go";
const MIN_MODULE = `module ${MOD_NAME}

go ${GO_VERSION}
`;

const INLINE_MODULE = `${MIN_MODULE}
require ${go.ADMIN_SDK} v4.6.0 // indirect

replace ${FUNCTIONS_MOD} => ${go.FUNCTIONS_SDK}
`;

const BLOCK_MODULE = `${MIN_MODULE}

require (
  ${go.ADMIN_SDK} v4.6.0 // indirect
)

replace (
  ${FUNCTIONS_MOD} => ${go.FUNCTIONS_SDK}
)
`;

describe("Modules", () => {
  it("Should parse a bare minimum module", () => {
    const mod = gomod.parseModule(MIN_MODULE);
    expect(mod.module).to.equal(MOD_NAME);
    expect(mod.version).to.equal(GO_VERSION);
  });

  it("Should parse inline statements", () => {
    const mod = gomod.parseModule(INLINE_MODULE);
    expect(mod.module).to.equal(MOD_NAME);
    expect(mod.version).to.equal(GO_VERSION);
    expect(mod.dependencies).to.deep.equal({
      [go.ADMIN_SDK]: "v4.6.0",
    });
    expect(mod.replaces).to.deep.equal({
      [FUNCTIONS_MOD]: go.FUNCTIONS_SDK,
    });
  });

  it("Should parse block statements", () => {
    const mod = gomod.parseModule(BLOCK_MODULE);
    expect(mod.module).to.equal(MOD_NAME);
    expect(mod.version).to.equal(GO_VERSION);
    expect(mod.dependencies).to.deep.equal({
      [go.ADMIN_SDK]: "v4.6.0",
    });
    expect(mod.replaces).to.deep.equal({
      [FUNCTIONS_MOD]: go.FUNCTIONS_SDK,
    });
  });
});
