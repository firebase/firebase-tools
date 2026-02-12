import { expect } from "chai";
import * as sinon from "sinon";
import * as prompt from "../prompt";
import * as client from "./client";
import { promptDeleteConnector, promptDeleteSchema } from "./prompts";

describe("prompts", () => {
  let confirmStub: sinon.SinonStub;
  let deleteConnectorStub: sinon.SinonStub;
  let deleteSchemaStub: sinon.SinonStub;

  beforeEach(() => {
    confirmStub = sinon.stub(prompt, "confirm");
    deleteConnectorStub = sinon.stub(client, "deleteConnector");
    deleteSchemaStub = sinon.stub(client, "deleteSchema");
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

  describe("promptDeleteSchema", () => {
    it("should delete schema if user confirms", async () => {
      confirmStub.resolves(true);
      deleteSchemaStub.resolves();

      await promptDeleteSchema({ force: false, nonInteractive: false }, "my-schema");

      expect(confirmStub.calledOnce).to.be.true;
      expect(deleteSchemaStub.calledOnceWith("my-schema")).to.be.true;
    });

    it("should not delete schema if user denies", async () => {
      confirmStub.resolves(false);

      await promptDeleteSchema({ force: false, nonInteractive: false }, "my-schema");

      expect(confirmStub.calledOnce).to.be.true;
      expect(deleteSchemaStub.notCalled).to.be.true;
    });
  });
});
