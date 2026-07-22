import { expect } from "chai";
import * as sinon from "sinon";
import { printVersionsTable } from "./remoteconfig-versions-list";
import { logger } from "../logger";

describe("remoteconfig:versions:list", () => {
  let sandbox: sinon.SinonSandbox;
  let loggerInfoStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    loggerInfoStub = sandbox.stub(logger, "info");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("printVersionsTable", () => {
    it("should print an empty table when versions is undefined", () => {
      printVersionsTable({} as any);
      expect(loggerInfoStub.calledOnce).to.be.true;
      // An empty table is still printed, just with no rows.
      expect(loggerInfoStub.getCall(0).args[0]).to.not.be.empty;
    });

    it("should print an empty table when versions is an empty array", () => {
      printVersionsTable({ versions: [] });
      expect(loggerInfoStub.calledOnce).to.be.true;
      // An empty table is still printed, just with no rows.
      expect(loggerInfoStub.getCall(0).args[0]).to.not.be.empty;
    });

    it("should print a table with version data", () => {
      const versions = [
        {
          versionNumber: "1",
          updateTime: "2025-02-12T00:00:00.000Z",
          updateUser: { email: "foo@bar.com" },
        },
      ];
      printVersionsTable({ versions });
      expect(loggerInfoStub.calledOnce).to.be.true;
      const output = loggerInfoStub.getCall(0).args[0];
      expect(output).to.include("1");
      expect(output).to.include("foo@bar.com");
    });
  });
});
