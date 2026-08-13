import { expect } from "chai";

import { command } from "./functions-kits-uninstall";
import { requireAuth } from "../requireAuth";
import { requireConfig } from "../requireConfig";

describe("functions:kits:uninstall", () => {
  it("should have requireConfig and requireAuth as before hooks", () => {
    expect(command["befores"]).to.deep.equal([
      { fn: requireConfig, args: [] },
      { fn: requireAuth, args: [] },
    ]);
  });
});
