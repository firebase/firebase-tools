import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { resolveWithin } from "./pathUtils";
import { FirebaseError } from "./error";

describe("resolveWithin", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-pathutils-"));
  });

  it("returns absolute path when subpath is inside base (relative)", () => {
    const p = resolveWithin(baseDir, "sub/dir");
    expect(p).to.equal(path.join(baseDir, "sub/dir"));
  });

  it("returns base when subpath normalizes to base (e.g., nested/..)", () => {
    const p = resolveWithin(baseDir, "nested/..");
    expect(p).to.equal(baseDir);
  });

  it("throws when subpath escapes base using ..", () => {
    expect(() => resolveWithin(baseDir, "../outside")).to.throw(FirebaseError);
  });

  it("throws with custom message when provided", () => {
    expect(() => resolveWithin(baseDir, "../outside", "Custom error"))
      .to.throw(FirebaseError)
      .with.property("message")
      .that.matches(/Custom error/);
  });

  it("throws when absolute subpath is outside base", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "fb-pathutils-out-"));
    expect(() => resolveWithin(baseDir, outside)).to.throw(FirebaseError);
  });

  it("allows absolute subpath when inside base", () => {
    const inside = path.join(baseDir, "child");
    const p = resolveWithin(baseDir, inside);
    expect(p).to.equal(inside);
  });
});
