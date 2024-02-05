import * as commandUtils from "../../emulator/commandUtils";
import { expect } from "chai";
import { FirebaseError } from "../../error";
import { EXPORT_ON_EXIT_USAGE_ERROR, EXPORT_ON_EXIT_CWD_DANGER } from "../../emulator/commandUtils";
import * as path from "path";
import * as sinon from "sinon";

describe("commandUtils", () => {
  const testSetExportOnExitOptions = (options: any): any => {
    commandUtils.setExportOnExitOptions(options);
    return options;
  };

  describe("Mocked path resolve", () => {
    const mockCWD = "/a/resolved/path/example";
    const mockDestinationDir = "/path/example";

    let pathStub: sinon.SinonStub;
    beforeEach(() => {
      pathStub = sinon.stub(path, "resolve").callsFake((path) => {
        return path === "." ? mockCWD : mockDestinationDir;
      });
    });

    afterEach(() => {
      pathStub.restore();
    });

    it("Should not block if destination contains a match to the CWD", () => {
      const directoryToAllow = mockDestinationDir;
      expect(testSetExportOnExitOptions({ exportOnExit: directoryToAllow }).exportOnExit).to.equal(
        directoryToAllow,
      );
    });
  });

  /**
   * Currently, setting the --export-on-exit as the current CWD can inflict on
   * full directory deletion
   */
  const directoriesThatShouldFail = [
    ".", // The current dir
    "./", // The current dir with /
    path.resolve("."), // An absolute path
    path.resolve(".."), // A folder that directs to the CWD
    path.resolve("../.."), // Another folder that directs to the CWD
  ];

  directoriesThatShouldFail.forEach((dir) => {
    it(`Should disallow the user to set the current folder (ex: ${dir}) as --export-on-exit option`, () => {
      expect(() => testSetExportOnExitOptions({ exportOnExit: dir })).to.throw(
        EXPORT_ON_EXIT_CWD_DANGER,
      );
      const cwdSubDir = path.join(dir, "some-dir");
      expect(testSetExportOnExitOptions({ exportOnExit: cwdSubDir }).exportOnExit).to.equal(
        cwdSubDir,
      );
    });
  });

  it("Should disallow the user to set the current folder via the --import flag", () => {
    expect(() => testSetExportOnExitOptions({ import: ".", exportOnExit: true })).to.throw(
      EXPORT_ON_EXIT_CWD_DANGER,
    );
    const cwdSubDir = path.join(".", "some-dir");
    expect(
      testSetExportOnExitOptions({ import: cwdSubDir, exportOnExit: true }).exportOnExit,
    ).to.equal(cwdSubDir);
  });

  it("should validate --export-on-exit options", () => {
    expect(testSetExportOnExitOptions({ import: "./data" }).exportOnExit).to.be.undefined;
    expect(
      testSetExportOnExitOptions({ import: "./data", exportOnExit: "./data" }).exportOnExit,
    ).to.eql("./data");
    expect(
      testSetExportOnExitOptions({ import: "./data", exportOnExit: "./dataExport" }).exportOnExit,
    ).to.eql("./dataExport");
    expect(
      testSetExportOnExitOptions({ import: "./data", exportOnExit: true }).exportOnExit,
    ).to.eql("./data");
    expect(() => testSetExportOnExitOptions({ exportOnExit: true })).to.throw(
      FirebaseError,
      EXPORT_ON_EXIT_USAGE_ERROR,
    );
    expect(() => testSetExportOnExitOptions({ import: "", exportOnExit: true })).to.throw(
      FirebaseError,
      EXPORT_ON_EXIT_USAGE_ERROR,
    );
    expect(() => testSetExportOnExitOptions({ import: "", exportOnExit: "" })).to.throw(
      FirebaseError,
      EXPORT_ON_EXIT_USAGE_ERROR,
    );
  });
  it("should delete the --import option when the dir does not exist together with --export-on-exit", () => {
    expect(
      testSetExportOnExitOptions({
        import: "./dataDirThatDoesNotExist",
        exportOnExit: "./dataDirThatDoesNotExist",
      }).import,
    ).to.be.undefined;
    const options = testSetExportOnExitOptions({
      import: "./dataDirThatDoesNotExist",
      exportOnExit: true,
    });
    expect(options.import).to.be.undefined;
    expect(options.exportOnExit).to.eql("./dataDirThatDoesNotExist");
  });
  it("should not touch the --import option when the dir does not exist but --export-on-exit is not set", () => {
    expect(
      testSetExportOnExitOptions({
        import: "./dataDirThatDoesNotExist",
      }).import,
    ).to.eql("./dataDirThatDoesNotExist");
  });
  it("should keep other unrelated options when using setExportOnExitOptions", () => {
    expect(
      testSetExportOnExitOptions({
        someUnrelatedOption: "isHere",
      }).someUnrelatedOption,
    ).to.eql("isHere");
  });
});
