import { expect } from "chai";
import * as sinon from "sinon";
import * as ailogic from "./ailogic";
import { Endpoint } from "../deploy/functions/backend";

describe("ailogic", () => {
  describe("upsertBlockingFunction", () => {
    let postStub: sinon.SinonStub;
    let patchStub: sinon.SinonStub;

    beforeEach(() => {
      postStub = sinon.stub(ailogic.client, "post");
      patchStub = sinon.stub(ailogic.client, "patch");
    });

    afterEach(() => {
      postStub.restore();
      patchStub.restore();
    });

    const mockEndpointBase = {
      id: "my-func",
      region: "us-central1",
      project: "my-project",
      entryPoint: "myFunc",
      platform: "gcfv2",
    } as const;

    it("should create trigger for beforeGenerateContent", async () => {
      const endpoint = {
        ...mockEndpointBase,
        eventType: ailogic.EVENT_TYPE_BEFORE_GENERATE_CONTENT,
      } as unknown as Endpoint;

      postStub.resolves({ body: { name: "trigger-name" } });

      await ailogic.upsertBlockingFunction(endpoint);

      expect(postStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/global/triggers",
        {
          cloudFunction: {
            id: "my-func",
            locationId: "us-central1",
          },
        },
        {
          queryParams: {
            triggerId: "before-generate-content",
            validateOnly: "false",
          },
        },
      );
    });

    it("should update trigger if create fails with 409", async () => {
      const endpoint = {
        ...mockEndpointBase,
        eventType: ailogic.EVENT_TYPE_AFTER_GENERATE_CONTENT,
        regionalWebhook: true,
      } as unknown as Endpoint;

      postStub.rejects({ status: 409 });
      patchStub.resolves({ body: { name: "trigger-name" } });

      await ailogic.upsertBlockingFunction(endpoint);

      expect(postStub).to.have.been.calledOnce;
      expect(patchStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/us-central1/triggers/after-generate-content",
        {
          cloudFunction: {
            id: "my-func",
            locationId: "us-central1",
          },
        },
        {
          queryParams: {
            allowMissing: "false",
            validateOnly: "false",
          },
        },
      );
    });

    it("should throw error if create fails with non-409", async () => {
      const endpoint = {
        ...mockEndpointBase,
        eventType: ailogic.EVENT_TYPE_BEFORE_GENERATE_CONTENT,
      } as unknown as Endpoint;

      postStub.rejects({ status: 500 });

      await expect(ailogic.upsertBlockingFunction(endpoint)).to.be.rejectedWith();
      expect(patchStub).to.not.have.been.called;
    });
  });

  describe("deleteBlockingFunction", () => {
    let deleteStub: sinon.SinonStub;

    beforeEach(() => {
      deleteStub = sinon.stub(ailogic.client, "delete");
    });

    afterEach(() => {
      deleteStub.restore();
    });

    it("should delete trigger", async () => {
      const endpoint = {
        id: "my-func",
        region: "us-central1",
        project: "my-project",
        eventType: ailogic.EVENT_TYPE_BEFORE_GENERATE_CONTENT,
      } as unknown as Endpoint;

      deleteStub.resolves({});

      await ailogic.deleteBlockingFunction(endpoint);

      expect(deleteStub).to.have.been.calledWithMatch(
        "projects/my-project/locations/global/triggers/before-generate-content",
        {
          queryParams: {
            allowMissing: "true",
            validateOnly: "false",
          },
        },
      );
    });
  });
});
