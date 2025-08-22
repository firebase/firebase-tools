import { expect } from "chai";
import * as sinon from "sinon";
import { getDataConnectEmulatorClient } from "./emulator";
import { Emulators } from "../../../emulator/types";
import * as apiv2 from "../../../apiv2";
import { DATACONNECT_API_VERSION } from "../../../dataconnect/dataplaneClient";

describe("getDataConnectEmulatorClient", () => {
  it("should create and return a Data Connect emulator client", async () => {
    const emulatorUrl = "http://localhost:9001";
    const mockHost: any = {
      getEmulatorUrl: sinon.stub().withArgs(Emulators.DATACONNECT).resolves(emulatorUrl),
    };
    const clientStub = sinon.stub(apiv2, "Client");

    await getDataConnectEmulatorClient(mockHost);

    expect(mockHost.getEmulatorUrl).to.have.been.calledWith(Emulators.DATACONNECT);
    expect(clientStub).to.have.been.calledWith({
      urlPrefix: emulatorUrl,
      apiVersion: DATACONNECT_API_VERSION,
      auth: false,
    });
  });
});
