import * as sinon from "sinon";
import { expect } from "chai";
import { logger } from "../logger";
import { printBackendsTable } from "./apphosting-backends-list";
import * as experiments from "../experiments";
import * as apphosting from "../gcp/apphosting";

describe("apphosting:backends:list printBackendsTable", () => {
  let loggerStub: sinon.SinonStub;
  let isEnabledStub: sinon.SinonStub;

  beforeEach(() => {
    loggerStub = sinon.stub(logger, "info");
    isEnabledStub = sinon.stub(experiments, "isEnabled");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should display Disabled if automaticBaseImageUpdatesDisabled is true", () => {
    isEnabledStub.withArgs("abiu").returns(true);
    const mockBackend: Partial<apphosting.Backend> = {
      name: "projects/test-project/locations/us-central1/backends/test-backend",
      uri: "https://test-backend.app",
      automaticBaseImageUpdatesDisabled: true,
      runtime: { value: "nodejs22" },
      updateTime: "2026-03-31T12:00:00Z",
    };

    printBackendsTable([mockBackend as apphosting.Backend]);

    expect(loggerStub).to.be.calledOnce;
    expect(loggerStub.firstCall.args[0]).to.include("Disabled");
  });

  it("should display Enabled if automaticBaseImageUpdatesDisabled is false", () => {
    isEnabledStub.withArgs("abiu").returns(true);
    const mockBackend: Partial<apphosting.Backend> = {
      name: "projects/test-project/locations/us-central1/backends/test-backend",
      uri: "https://test-backend.app",
      automaticBaseImageUpdatesDisabled: false,
      runtime: { value: "nodejs22" },
      updateTime: "2026-03-31T12:00:00Z",
    };

    printBackendsTable([mockBackend as apphosting.Backend]);

    expect(loggerStub).to.be.calledOnce;
    expect(loggerStub.firstCall.args[0]).to.include("Enabled");
  });

  it("should fallback to Disabled if automaticBaseImageUpdatesDisabled is missing and runtime is legacy", () => {
    isEnabledStub.withArgs("abiu").returns(true);
    const mockBackend: Partial<apphosting.Backend> = {
      name: "projects/test-project/locations/us-central1/backends/test-backend",
      uri: "https://test-backend.app",
      runtime: { value: "nodejs" },
      updateTime: "2026-03-31T12:00:00Z",
    };

    printBackendsTable([mockBackend as apphosting.Backend]);

    expect(loggerStub).to.be.calledOnce;
    expect(loggerStub.firstCall.args[0]).to.include("Disabled");
  });

  it("should fallback to Enabled if automaticBaseImageUpdatesDisabled is missing and runtime is new", () => {
    isEnabledStub.withArgs("abiu").returns(true);
    const mockBackend: Partial<apphosting.Backend> = {
      name: "projects/test-project/locations/us-central1/backends/test-backend",
      uri: "https://test-backend.app",
      runtime: { value: "nodejs22" },
      updateTime: "2026-03-31T12:00:00Z",
    };

    printBackendsTable([mockBackend as apphosting.Backend]);

    expect(loggerStub).to.be.calledOnce;
    expect(loggerStub.firstCall.args[0]).to.include("Enabled");
  });
});
