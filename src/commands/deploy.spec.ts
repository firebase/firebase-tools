import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./deploy";
import * as experiments from "../experiments";
import * as requirePermissionsModule from "../requirePermissions";
import { FirebaseError } from "../error";
import { Options } from "../options";

describe("deploy command ailogic gating", () => {
  let experimentEnabled: boolean;

  // The target-filtering before: computes filteredTargets, gates ailogic, then
  // checks permissions.
  const filterBefore = (
    command as unknown as {
      befores: Array<{ fn: (options: Options) => unknown; args: unknown[] }>;
    }
  ).befores[1];

  function makeOptions(): Options {
    return {
      only: "ailogic",
      config: { has: (k: string) => k === "ailogic" },
    } as unknown as Options;
  }

  beforeEach(() => {
    experimentEnabled = experiments.isEnabled("ailogic");
    sinon.stub(requirePermissionsModule, "requirePermissions").resolves();
  });

  afterEach(() => {
    experiments.setEnabled("ailogic", experimentEnabled);
    sinon.restore();
  });

  it("rejects an ailogic deploy up front when the experiment is off", () => {
    experiments.setEnabled("ailogic", false);
    expect(() => filterBefore.fn(makeOptions())).to.throw(FirebaseError, /experiments:enable/);
  });

  it("proceeds to the permissions check when the experiment is on", async () => {
    experiments.setEnabled("ailogic", true);
    await filterBefore.fn(makeOptions());
    expect(requirePermissionsModule.requirePermissions).to.have.been.calledOnce;
  });
});
