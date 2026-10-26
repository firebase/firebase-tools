import { expect } from "chai";
import * as sinon from "sinon";
import * as runv2 from "../../gcp/runv2";
import * as utils from "../../utils";
import { release } from "./release";

describe("run release", () => {
  afterEach(() => sinon.restore());

  it("logs where each service is deployed", async () => {
    const logStub = sinon.stub(utils, "logLabeledSuccess");

    await release(
      { projectId: "my-project" },
      {},
      {
        run: {
          services: [
            {
              config: { serviceId: "web", region: "us-central1" },
              deployed: { uri: "https://web.run.app" } as runv2.Service,
            },
            // A service without a URI was still deployed, so it's still logged.
            { config: { serviceId: "api", region: "us-east1" }, deployed: {} as runv2.Service },
          ],
        },
      },
    );

    expect(logStub).to.have.been.calledWithExactly(
      "run",
      "Deployed service web in us-central1 to https://web.run.app",
    );
    expect(logStub).to.have.been.calledWithExactly("run", "Deployed service api in us-east1");
  });
});
