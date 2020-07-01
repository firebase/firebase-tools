import * as commandUtils from "../../emulator/commandUtils";
import { expect } from "chai";
import { FirebaseError } from "../../error";
import { EXPORT_ON_EXIT_USAGE_ERROR } from "../../emulator/commandUtils";

describe("commandUtils", () => {
  it("should validate --export-on-exit options", () => {
    expect(commandUtils.setExportOnExitOptions({ import: "./data" }).exportOnExit).to.be.undefined;
    expect(
      commandUtils.setExportOnExitOptions({ import: "./data", exportOnExit: "./data" }).exportOnExit
    ).to.eql("./data");
    expect(
      commandUtils.setExportOnExitOptions({ import: "./data", exportOnExit: "./dataExport" })
        .exportOnExit
    ).to.eql("./dataExport");
    expect(
      commandUtils.setExportOnExitOptions({ import: "./data", exportOnExit: true }).exportOnExit
    ).to.eql("./data");
    expect(() => commandUtils.setExportOnExitOptions({ exportOnExit: true })).to.throw(
      FirebaseError,
      EXPORT_ON_EXIT_USAGE_ERROR
    );
  });
  it("should delete the --import option when the dir does not exist together with --export-on-exit", () => {
    expect(
      commandUtils.setExportOnExitOptions({
        import: "./dataDirThatDoesNotExist",
        exportOnExit: "./dataDirThatDoesNotExist",
      }).import
    ).to.be.undefined;
    let options = commandUtils.setExportOnExitOptions({
      import: "./dataDirThatDoesNotExist",
      exportOnExit: true,
    });
    expect(options.import).to.be.undefined;
    expect(options.exportOnExit).to.eql("./dataDirThatDoesNotExist");
  });
  it("should not touch the --import option when the dir does not exist but --export-on-exit is not set", () => {
    expect(
      commandUtils.setExportOnExitOptions({
        import: "./dataDirThatDoesNotExist",
      }).import
    ).to.eql("./dataDirThatDoesNotExist");
  });
  it("should keep other unrelated options when using setExportOnExitOptions", () => {
    expect(
      commandUtils.setExportOnExitOptions({
        someUnrelatedOption: "isHere",
      }).someUnrelatedOption
    ).to.eql("isHere");
  });
});
