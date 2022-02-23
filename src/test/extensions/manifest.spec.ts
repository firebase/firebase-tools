import { expect } from "chai";

import * as manifest from "../../extensions/manifest";
import { Config } from "../../config";

const TEST_CONFIG =  new Config({
    extensions: {
        "delete-user-data": "firebase/delete-user-data@0.1.12",
        "delete-user-data-gm2h": "firebase/delete-user-data@0.1.12"
      }
}, {});
describe("manifest", () => {
  describe(`${manifest.instanceExists}`, () => {
    it("should return true for an existing instance", () => {
      const result = manifest.instanceExists('delete-user-data', TEST_CONFIG);

      expect(result).to.be.true;
    });

    it("should return false for a non-existing instance", () => {
        const result = manifest.instanceExists('does-not-exist', TEST_CONFIG);
  
        expect(result).to.be.false;
      });
  });
});
