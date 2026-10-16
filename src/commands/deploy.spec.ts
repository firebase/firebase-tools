import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./deploy";
import { hostingApiOrigin } from "../api";
import * as ensureApiEnabledModule from "../ensureApiEnabled";
import * as experiments from "../experiments";
import * as requireHostingSiteModule from "../requireHostingSite";
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

describe("deploy command hosting API enablement", () => {
  const hostingBefore = (
    command as unknown as {
      befores: Array<{ fn: (options: Options) => Promise<void>; args: unknown[] }>;
    }
  ).befores.find((b) => b.fn.toString().includes("requireHostingSite"));

  let ensureHostingApiStub: sinon.SinonStub;
  let requireHostingSiteStub: sinon.SinonStub;

  beforeEach(() => {
    ensureHostingApiStub = sinon.stub(ensureApiEnabledModule, "ensure").resolves();
    requireHostingSiteStub = sinon.stub(requireHostingSiteModule, "requireHostingSite").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("ensures hosting API is enabled when hosting is in filtered targets", async () => {
    if (!hostingBefore) {
      throw new Error("Could not find hosting before hook on deploy command");
    }
    const options = {
      project: "my-project",
      filteredTargets: ["hosting"],
    } as unknown as Options;

    await hostingBefore.fn(options);

    expect(ensureHostingApiStub).to.have.been.calledOnceWith(
      "my-project",
      hostingApiOrigin(),
      "hosting",
      true,
    );
    expect(requireHostingSiteStub).to.have.been.calledOnceWith(options);
  });

  it("does not check hosting API when hosting is not in filtered targets", async () => {
    if (!hostingBefore) {
      throw new Error("Could not find hosting before hook on deploy command");
    }
    const options = {
      project: "my-project",
      filteredTargets: ["firestore"],
    } as unknown as Options;

    await hostingBefore.fn(options);

    expect(ensureHostingApiStub).to.not.have.been.called;
    expect(requireHostingSiteStub).to.not.have.been.called;
  });
});
