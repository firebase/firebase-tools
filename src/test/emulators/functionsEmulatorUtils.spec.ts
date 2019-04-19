import { expect } from "chai";
import { _extractParamsFromPath } from "../../emulator/functionsEmulatorUtils";

describe("Functions emulator utils", () => {
  describe("extractParamsFromPath", () => {
    it("should extract multiple params from a long path", async () => {
      const bindings: any = _extractParamsFromPath("{a}/{b}/{c}/{d}", "asdf/pqrs/tuvw/xyzh");

      expect(bindings.a).to.eq("asdf");
      expect(bindings.b).to.eq("pqrs");
      expect(bindings.c).to.eq("tuvw");
      expect(bindings.d).to.eq("xyzh");
    });
  });
});
