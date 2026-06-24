import { expect } from "chai";
import * as sinon from "sinon";

import { prepareDynamicExtensions } from "./prepare";
import * as planner from "./planner";
import * as projectUtils from "../../projectUtils";
import * as extensionsHelper from "../../extensions/extensionsHelper";
import * as requirePermissions from "../../requirePermissions";
import { Context, Payload } from "./args";
import * as v2FunctionHelper from "./v2FunctionHelper";
import * as tos from "../../extensions/tos";

describe("Extensions prepare", () => {
  describe("prepareDynamicExtensions", () => {
    let haveDynamicStub: sinon.SinonStub;
    let ensureExtensionsApiEnabledStub: sinon.SinonStub;
    let requirePermissionsStub: sinon.SinonStub;
    let needProjectIdStub: sinon.SinonStub;
    let needProjectNumberStub: sinon.SinonStub;

    beforeEach(() => {
      haveDynamicStub = sinon.stub(planner, "haveDynamic").resolves([]);
      ensureExtensionsApiEnabledStub = sinon
        .stub(extensionsHelper, "ensureExtensionsApiEnabled")
        .resolves();
      requirePermissionsStub = sinon.stub(requirePermissions, "requirePermissions").resolves();
      needProjectIdStub = sinon.stub(projectUtils, "needProjectId").returns("test-project");
      needProjectNumberStub = sinon.stub(projectUtils, "needProjectNumber").resolves("123456");
    });

    afterEach(() => {
      haveDynamicStub.restore();
      ensureExtensionsApiEnabledStub.restore();
      requirePermissionsStub.restore();
      needProjectIdStub.restore();
      needProjectNumberStub.restore();
    });

    it("should swallow errors and exit cleanly if the extensions API is down", async () => {
      haveDynamicStub.rejects(new Error("Extensions API is having an outage"));

      const context: Context = {};
      const payload: Payload = {};
      const options: any = {
        config: {
          src: { functions: { source: "functions" } },
        },
      };
      const builds = {};

      // This should not throw.
      await expect(prepareDynamicExtensions(context, options, payload, builds)).to.not.be.rejected;
    });

    it("should proceed normally if extensions API is healthy", async () => {
      haveDynamicStub.resolves([
        {
          instanceId: "test-extension",
          ref: { publisherId: "test", extensionId: "test", version: "0.1.0" },
          params: {},
          systemParams: {},
          labels: { codebase: "default" },
        },
      ]);

      const context: Context = {};
      const payload: Payload = {};
      const options: any = {
        config: {
          get: () => [],
          src: { functions: { source: "functions" } },
        },
        rc: { getEtags: () => [] },
        dryRun: true,
      };
      const builds = {};

      const wantDynamicStub: sinon.SinonStub = sinon.stub(planner, "wantDynamic").resolves([]);
      const v2apistub: sinon.SinonStub = sinon
        .stub(v2FunctionHelper, "ensureNecessaryV2ApisAndRoles")
        .resolves();
      const tosStub: sinon.SinonStub = sinon
        .stub(tos, "getAppDeveloperTOSStatus")
        .resolves({ lastAcceptedVersion: "1.0.0" } as any);

      // Expect successful completion
      await expect(prepareDynamicExtensions(context, options, payload, builds)).to.not.be.rejected;

      wantDynamicStub.restore();
      v2apistub.restore();
      tosStub.restore();
    });
  });
});
