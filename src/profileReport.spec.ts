import { expect } from "chai";

import * as stream from "stream";
import { extractReadableIndex, formatNumber, ProfileReport } from "./profileReport";
import { SAMPLE_INPUT_PATH, SAMPLE_OUTPUT_PATH } from "./test/fixtures/profiler-data";

function combinerFunc(obj1: any, obj2: any): any {
  return { count: obj1.count + obj2.count };
}

function newReport() {
  const throwAwayStream = new stream.PassThrough();
  return new ProfileReport(SAMPLE_INPUT_PATH, throwAwayStream, {
    format: "JSON",
    isFile: false,
    collapse: true,
    isInput: true,
  });
}

describe("profilerReport", () => {
  it("should correctly generate a report", () => {
    const report = newReport();
    const output = require(SAMPLE_OUTPUT_PATH);
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
