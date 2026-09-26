import { expect } from "chai";
import { MyersDiffEngine } from "./distance";

describe("MyersDiffEngine", () => {
  describe("getSimilarity", () => {
    it("should return 1.0 for exact string match", () => {
      const a = "line 1\nline 2\nline 3";
      const b = "line 1\nline 2\nline 3";
      expect(MyersDiffEngine.getSimilarity(a, b)).to.equal(1.0);
    });

    it("should return 1.0 for both empty strings", () => {
      expect(MyersDiffEngine.getSimilarity("", "")).to.equal(1.0);
    });

    it("should return 0.0 if one string is empty", () => {
      expect(MyersDiffEngine.getSimilarity("hello", "")).to.equal(0.0);
      expect(MyersDiffEngine.getSimilarity("", "world")).to.equal(0.0);
    });

    it("should return correct similarity for partial match", () => {
      // 2 matched lines, total lines A = 3, total lines B = 3
      // Similarity = (2 * 2) / (3 + 3) = 4 / 6 = 0.6666...
      const a = "line 1\nline 2\nline 3";
      const b = "line 1\nline 2\nline 4";
      const similarity = MyersDiffEngine.getSimilarity(a, b);
      expect(similarity).to.be.closeTo(0.666, 0.001);
    });

    it("should return 0.0 for completely disjoint strings", () => {
      const a = "foo\nbar";
      const b = "baz\nqux";
      expect(MyersDiffEngine.getSimilarity(a, b)).to.equal(0.0);
    });
  });
});
