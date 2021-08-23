import { expect } from "chai";
import * as sinon from "sinon";

import * as configExport from "../../commands/functions-config-export";
import * as rc from "../../rc";

describe("functions-config-export", () => {
  describe("getAllProjects", () => {
    let loadRCStub: sinon.SinonStub;

    beforeEach(() => {
      loadRCStub = sinon.stub(rc, "loadRC").returns({} as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    afterEach(() => {
      loadRCStub.restore();
    });

    it("should include projectId from the options", () => {
      expect(configExport.getAllProjects({ projectId: "project-0" })).to.have.deep.members([
        {
          projectId: "project-0",
        },
      ]);
    });

    it("should include project and its alias from firebaserc", () => {
      loadRCStub.returns({ projects: { dev: "project-0", prod: "project-1" } });
      expect(configExport.getAllProjects({ projectId: "project-0" })).to.have.deep.members([
        {
          projectId: "project-0",
          alias: "dev",
        },
        {
          projectId: "project-1",
          alias: "prod",
        },
      ]);
    });

    it("should ignore 'default' alias", () => {
      loadRCStub.returns({
        projects: { default: "project-1", dev: "project-0", prod: "project-1" },
      });
      expect(configExport.getAllProjects({ projectId: "project-0" })).to.have.deep.members([
        {
          projectId: "project-0",
          alias: "dev",
        },
        {
          projectId: "project-1",
          alias: "prod",
        },
      ]);
    });

    it("should collect project with 'default' alias", () => {
      loadRCStub.returns({
        projects: { default: "project-2", dev: "project-0", prod: "project-1" },
      });
      expect(configExport.getAllProjects({ projectId: "project-0" })).to.have.deep.members([
        {
          projectId: "project-0",
          alias: "dev",
        },
        {
          projectId: "project-1",
          alias: "prod",
        },
        {
          projectId: "project-2",
        },
      ]);
    });
  });
});
