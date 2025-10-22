import * as chai from "chai";
import chaisFs from "chai-fs";

// Prevent file paths in assertions from being cut off
chai.config.truncateThreshold = 0;
chai.use(chaisFs);

export function expectFile(path: string): Chai.Assertion {
  return chai.expect(path);
}
