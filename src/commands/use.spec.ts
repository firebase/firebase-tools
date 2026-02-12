import { expect } from "chai";
import * as sinon from "sinon";
import { RC } from "../rc";
import { setNewActive } from "./use";
import * as projects from "../management/projects";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { logger } from "../logger";

describe("commands/use", () => {
  let rc: RC;
  let getProjectStub: sinon.SinonStub;
  let makeActiveProjectStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;

  beforeEach(() => {
    rc = new RC();
    getProjectStub = sinon.stub(projects, "getProject");
    makeActiveProjectStub = sinon.stub(utils, "makeActiveProject");
    loggerInfoStub = sinon.stub(logger, "info");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("setNewActive", () => {
    it("should set active project by alias", async () => {
      rc.addProjectAlias("prod", "project-id");
      getProjectStub.resolves({ projectId: "project-id" });

      await setNewActive("prod", undefined, rc, "root");

      expect(makeActiveProjectStub.calledWith("root", "prod")).to.be.true;
      expect(loggerInfoStub.calledWithMatch(/Now using alias/)).to.be.true;
    });

    it("should set active project by ID", async () => {
      getProjectStub.resolves({ projectId: "project-id" });

      await setNewActive("project-id", undefined, rc, "root");

      expect(makeActiveProjectStub.calledWith("root", "project-id")).to.be.true;
      expect(loggerInfoStub.calledWithMatch(/Now using project/)).to.be.true;
    });

    it("should create alias when --alias is provided", async () => {
      getProjectStub.resolves({ projectId: "project-id" });

      await setNewActive("project-id", "prod", rc, "root");

      expect(rc.resolveAlias("prod")).to.equal("project-id");
      expect(makeActiveProjectStub.calledWith("root", "project-id")).to.be.true;
    });

    it("should throw error if project does not exist", async () => {
      getProjectStub.rejects(new Error("Not found"));

      await expect(setNewActive("non-existent", undefined, rc, "root")).to.be.rejectedWith(
        FirebaseError,
        /Invalid project selection/,
      );
    });
  });
});
