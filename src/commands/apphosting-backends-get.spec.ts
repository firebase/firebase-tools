import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./apphosting-backends-get";
import * as apphosting from "../gcp/apphosting";
import * as backendsList from "./apphosting-backends-list";
import * as utils from "../utils";
import { Options } from "../options";

describe("apphosting:backends:get", () => {
  const actionFn = (
    command as unknown as {
      actionFn: (backend: string, options: Options) => Promise<unknown>;
    }
  ).actionFn;

  const options = { project: "test-project", projectId: "test-project" } as unknown as Options;

  let listBackendsStub: sinon.SinonStub;
  let logWarningStub: sinon.SinonStub;
  let printBackendsTableStub: sinon.SinonStub;

  function backend(location: string, id: string): apphosting.Backend {
    return {
      name: `projects/test-project/locations/${location}/backends/${id}`,
    } as apphosting.Backend;
  }

  beforeEach(() => {
    listBackendsStub = sinon.stub(apphosting, "listBackends");
    logWarningStub = sinon.stub(utils, "logWarning");
    printBackendsTableStub = sinon.stub(backendsList, "printBackendsTable");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("looks up the backend across all regions and returns the match", async () => {
    const match = backend("us-central1", "my-backend");
    listBackendsStub.resolves({ backends: [backend("us-central1", "other"), match] });

    const result = await actionFn("my-backend", options);

    expect(listBackendsStub).to.have.been.calledOnceWith("test-project", "-");
    expect(result).to.equal(match);
    expect(logWarningStub).to.not.have.been.called;
    expect(printBackendsTableStub).to.have.been.calledOnceWith([match]);
  });

  it("warns and returns undefined when the backend is not found", async () => {
    listBackendsStub.resolves({ backends: [] });

    const result = await actionFn("my-backend", options);

    expect(result).to.be.undefined;
    expect(logWarningStub).to.have.been.calledOnceWith('Backend "my-backend" not found');
    expect(printBackendsTableStub).to.not.have.been.called;
  });

  it("warns and returns the first match when the ID exists in multiple regions", async () => {
    const first = backend("us-central1", "my-backend");
    const second = backend("europe-west4", "my-backend");
    listBackendsStub.resolves({ backends: [first, second] });

    const result = await actionFn("my-backend", options);

    expect(result).to.equal(first);
    expect(printBackendsTableStub).to.have.been.calledOnceWith([first]);
    expect(logWarningStub).to.have.been.calledOnce;
    const message = logWarningStub.firstCall.args[0] as string;
    expect(message).to.include(
      'Detected multiple backends with ID "my-backend" in regions: us-central1, europe-west4.',
    );
    expect(message).to.not.include("}");
    expect(message).to.include("Returning the backend in region us-central1:");
  });
});
