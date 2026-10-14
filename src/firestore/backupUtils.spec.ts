import { expect } from "chai";

import { calculateRetention } from "./backupUtils";

describe("calculateRetention", () => {
  it("should accept minutes", () => {
    expect(calculateRetention("5m")).to.eq(300);
  });

  it("should accept hours", () => {
    expect(calculateRetention("3h")).to.eq(10800);
  });

  it("should accept days", () => {
    expect(calculateRetention("2d")).to.eq(172800);
  });

  it("should accept weeks", () => {
    expect(calculateRetention("3w")).to.eq(1814400);
  });
});
