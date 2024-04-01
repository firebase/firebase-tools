import { expect } from "chai";
import * as sinon from "sinon";

import * as fsImport from "../../fsutils";
import * as config from "../../apphosting/config";

describe("config", () => {
  describe("yamlPath", () => {
    let fs: sinon.SinonStubbedInstance<typeof fsImport>;

    beforeEach(() => {
      fs = sinon.stub(fsImport);
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("finds apphosting.yaml at cwd", () => {
      fs.fileExistsSync.withArgs("/cwd/apphosting.yaml").returns(true);
      expect(config.yamlPath("/cwd")).equals("/cwd/apphosting.yaml");
    });

    it("finds apphosting.yaml in a parent directory", () => {
      fs.fileExistsSync.withArgs("/parent/cwd/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/cwd/firebase.json").returns(false);
      fs.fileExistsSync.withArgs("/parent/apphosting.yaml").returns(true);

      expect(config.yamlPath("/parent/cwd")).equals("/parent/apphosting.yaml");
    });

    it("returns null if it finds firebase.json without finding apphosting.yaml", () => {
      fs.fileExistsSync.withArgs("/parent/cwd/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/cwd/firebase.json").returns(false);
      fs.fileExistsSync.withArgs("/parent/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/firebase.json").returns(true);

      expect(config.yamlPath("/parent/cwd")).equals(null);
    });

    it("returns if it reaches the fs root", () => {
      fs.fileExistsSync.withArgs("/parent/cwd/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/cwd/firebase.json").returns(false);
      fs.fileExistsSync.withArgs("/parent/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/firebase.json").returns(false);
      fs.fileExistsSync.withArgs("/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/firebase.json").returns(false);

      expect(config.yamlPath("/parent/cwd")).equals(null);
    });
  });
});
