import { expect } from "chai";

import * as runtimes from "../../../../deploy/functions/runtimes";

describe("getHumanFriendlyRuntimeName", () => {
  it("should properly convert raw runtime to human friendly runtime", () => {
    expect(runtimes.getHumanFriendlyRuntimeName("nodejs6")).to.contain("Node.js");
  });
});
