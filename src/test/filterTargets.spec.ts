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
import { filterTargets } from "../filterTargets";
import { Options } from "../options";
import { RC } from "../rc";

const SAMPLE_OPTIONS: Options = {
  cwd: "/",
  configPath: "/",
  /* eslint-disable-next-line */
  config: {} as any,
  only: "",
  except: "",
  nonInteractive: false,
  json: false,
  interactive: false,
  debug: false,
  force: false,
  filteredTargets: [],
  rc: new RC(),
};

const VALID_TARGETS = ["hosting", "functions"];

describe("filterTargets", () => {
  it("should leave targets alone if no filtering is specified", () => {
    const o = Object.assign(SAMPLE_OPTIONS, {
      config: {
        has: () => true,
      },
    });
    expect(filterTargets(o, VALID_TARGETS)).to.deep.equal(["hosting", "functions"]);
  });

  it("should filter targets from --only", () => {
    const o = Object.assign(SAMPLE_OPTIONS, {
      config: {
        has: () => true,
      },
      only: "hosting",
    });
    expect(filterTargets(o, VALID_TARGETS)).to.deep.equal(["hosting"]);
  });

  it("should filter out targets with --except", () => {
    const o = Object.assign(SAMPLE_OPTIONS, {
      config: {
        has: () => true,
      },
      except: "functions",
    });
    expect(filterTargets(o, VALID_TARGETS)).to.deep.equal(["hosting"]);
  });
});
