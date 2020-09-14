import { expect } from "chai";

import { normalizeName } from "../../hosting/api";

describe("normalizeName", () => {
  const tests = [
    { in: "happy-path", out: "happy-path" },
    { in: "feature/branch", out: "feature-branch" },
    { in: "featuRe/Branch", out: "featuRe-Branch" },
    { in: "happyBranch", out: "happyBranch" },
  ];

  for (const t of tests) {
    it(`should handle the normalization of ${t.in}`, () => {
      expect(normalizeName(t.in)).to.equal(t.out);
    });
  }
});
