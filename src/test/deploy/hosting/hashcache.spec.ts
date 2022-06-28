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
import { existsSync, mkdirpSync, readFileSync, writeFileSync } from "fs-extra";
import { join } from "path";
import * as tmp from "tmp";

import { load, dump, HashRecord } from "../../../deploy/hosting/hashcache";

tmp.setGracefulCleanup();

describe("hashcache", () => {
  it("should return an empty object if a file doesn't exist", () => {
    expect(load("cwd-doesnt-exist", "somename")).to.deep.equal(new Map());
  });

  it("should be able to dump configuration to a file", () => {
    const dir = tmp.dirSync();
    const name = "testcache";
    const data = new Map<string, HashRecord>([["foo", { mtime: 0, hash: "deadbeef" }]]);

    expect(() => dump(dir.name, name, data)).to.not.throw();

    expect(existsSync(join(dir.name, ".firebase", `hosting.${name}.cache`))).to.be.true;
    expect(readFileSync(join(dir.name, ".firebase", `hosting.${name}.cache`), "utf8")).to.equal(
      "foo,0,deadbeef\n"
    );
  });

  it("should be able to load configuration from a file", () => {
    const dir = tmp.dirSync();
    const name = "testcache";
    mkdirpSync(join(dir.name, ".firebase"));
    writeFileSync(join(dir.name, ".firebase", `hosting.${name}.cache`), "bar,4,alivebeef\n");

    expect(load(dir.name, name)).to.deep.equal(
      new Map<string, HashRecord>([["bar", { mtime: 4, hash: "alivebeef" }]])
    );
  });
});
