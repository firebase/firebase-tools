import * as chai from "chai";
import chaiFs from "chai-fs";

// Prevent file paths in assertions from being cut off
chai.config.truncateThreshold = 0;
chai.use(chaiFs);

export function expectFile(path: string): Chai.Assertion {
  return chai.expect(path);
}
