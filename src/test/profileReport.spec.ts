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

import * as path from "path";
import * as stream from "stream";
import { extractReadableIndex, formatNumber, ProfileReport } from "../profileReport";

function combinerFunc(obj1: any, obj2: any): any {
  return { count: obj1.count + obj2.count };
}

const fixturesDir = path.resolve(__dirname, "./fixtures");

function newReport() {
  const input = path.resolve(fixturesDir, "profiler-data/sample.json");
  const throwAwayStream = new stream.PassThrough();
  return new ProfileReport(input, throwAwayStream, {
    format: "JSON",
    isFile: false,
    collapse: true,
    isInput: true,
  });
}

describe("profilerReport", () => {
  it("should correctly generate a report", () => {
    const report = newReport();
    const output = require(path.resolve(fixturesDir, "profiler-data/sample-output.json"));
    return expect(report.generate()).to.eventually.deep.equal(output);
  });

  it("should format numbers correctly", () => {
    let result = formatNumber(5);
    expect(result).to.eq("5");
    result = formatNumber(5.0);
    expect(result).to.eq("5");
    result = formatNumber(3.33);
    expect(result).to.eq("3.33");
    result = formatNumber(3.123423);
    expect(result).to.eq("3.12");
    result = formatNumber(3.129);
    expect(result).to.eq("3.13");
    result = formatNumber(3123423232);
    expect(result).to.eq("3,123,423,232");
    result = formatNumber(3123423232.4242);
    expect(result).to.eq("3,123,423,232.42");
  });

  it("should not collapse paths if not needed", () => {
    const report = newReport();
    const data: Record<string, any> = {};
    for (let i = 0; i < 20; i++) {
      data[`/path/num${i}`] = { count: 1 };
    }
    const result = report.collapsePaths(data, combinerFunc);
    expect(result).to.deep.eq(data);
  });

  it("should collapse paths to $wildcard", () => {
    const report = newReport();
    const data: Record<string, any> = {};
    for (let i = 0; i < 30; i++) {
      data[`/path/num${i}`] = { count: 1 };
    }
    const result = report.collapsePaths(data, combinerFunc);
    expect(result).to.deep.eq({ "/path/$wildcard": { count: 30 } });
  });

  it("should not collapse paths with --no-collapse", () => {
    const report = newReport();
    report.options.collapse = false;
    const data: Record<string, any> = {};
    for (let i = 0; i < 30; i++) {
      data[`/path/num${i}`] = { count: 1 };
    }
    const result = report.collapsePaths(data, combinerFunc);
    expect(result).to.deep.eq(data);
  });

  it("should collapse paths recursively", () => {
    const report = newReport();
    const data: Record<string, any> = {};
    for (let i = 0; i < 30; i++) {
      data[`/path/num${i}/next${i}`] = { count: 1 };
    }
    data["/path/num1/bar/test"] = { count: 1 };
    data["/foo"] = { count: 1 };
    const result = report.collapsePaths(data, combinerFunc);
    expect(result).to.deep.eq({
      "/path/$wildcard/$wildcard": { count: 30 },
      "/path/$wildcard/$wildcard/test": { count: 1 },
      "/foo": { count: 1 },
    });
  });

  it("should extract the correct path index", () => {
    const query = { index: { path: ["foo", "bar"] } };
    const result = extractReadableIndex(query);
    expect(result).to.eq("/foo/bar");
  });

  it("should extract the correct value index", () => {
    const query = { index: {} };
    const result = extractReadableIndex(query);
    expect(result).to.eq(".value");
  });
});
