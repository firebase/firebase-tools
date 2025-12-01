import { expect } from "chai";
import * as path from "path";
import { loadCJSON } from "./loadCJSON";
import { FirebaseError } from "./error";

describe("loadCJSON", () => {
  const fixturesDir = path.join(__dirname, "test", "fixtures", "loadCJSON");

  it("should return parsed JSON on success", () => {
    const filePath = path.join(fixturesDir, "valid.cjson");
    const result = loadCJSON(filePath);
    expect(result).to.deep.equal({ key: "value" });
  });

  it("should throw FirebaseError on ENOENT", () => {
    const filePath = path.join(fixturesDir, "nonexistent.cjson");
    expect(() => loadCJSON(filePath)).to.throw(
      FirebaseError,
      "File " + filePath + " does not exist"
    );
  });

  it("should throw FirebaseError on parse error", () => {
    const filePath = path.join(fixturesDir, "invalid.cjson");
    expect(() => loadCJSON(filePath)).to.throw(
      FirebaseError,
      new RegExp(`Parse Error in ${filePath}`),
    );
  });
});
