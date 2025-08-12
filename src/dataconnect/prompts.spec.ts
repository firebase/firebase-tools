import { expect } from "chai";
import * as sinon from "sinon";
import * as prompt from "../prompt";
import * as client from "./client";
import { promptDeleteConnector } from "./prompts";

describe("prompts", () => {
  let confirmStub: sinon.SinonStub;
  let deleteConnectorStub: sinon.SinonStub;

  beforeEach(() => {
    confirmStub = sinon.stub(prompt, "confirm");
    deleteConnectorStub = sinon.stub(client, "deleteConnector");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("promptDeleteConnector", () => {
    it("should delete connector if user confirms", async () => {
      confirmStub.resolves(true);
      deleteConnectorStub.resolves();

      await promptDeleteConnector({ force: false, nonInteractive: false }, "my-connector");

      expect(confirmStub.calledOnce).to.be.true;
      expect(deleteConnectorStub.calledOnceWith("my-connector")).to.be.true;
    });

    it("should not delete connector if user denies", async () => {
      confirmStub.resolves(false);

      await promptDeleteConnector({ force: false, nonInteractive: false }, "my-connector");

      expect(confirmStub.calledOnce).to.be.true;
      expect(deleteConnectorStub.notCalled).to.be.true;
    });
  });
});
