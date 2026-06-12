import { expect } from "chai";

import * as runtime from "../../standalone/runtime";

describe("standalone runtime", () => {
  describe("normalizeShellScriptArgs", () => {
    it("strips npm's -- sentinel after -c", () => {
      expect(runtime.normalizeShellScriptArgs(["-c", "--", "npm install"])).to.deep.equal([
        "npm install",
      ]);
    });

    it("preserves a leading -- when it is not the -c sentinel", () => {
      expect(runtime.normalizeShellScriptArgs(["--", "npm install"])).to.deep.equal([
        "--",
        "npm install",
      ]);
    });

    it("preserves arguments after the command string", () => {
      expect(
        runtime.normalizeShellScriptArgs(["-c", "--", "node ./script.js", "--flag", "value"]),
      ).to.deep.equal(["node ./script.js", "--flag", "value"]);
    });
  });
});
