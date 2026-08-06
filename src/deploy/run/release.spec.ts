import { expect } from "chai";
import * as sinon from "sinon";
import { release } from "./release";
import * as gcs from "../../gcp/storage";

describe("run release", () => {
  let deleteObjectStub: sinon.SinonStub;

  beforeEach(() => {
    deleteObjectStub = sinon.stub(gcs, "deleteObject").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should delete staging objects", async () => {
    const payload = {
      run: {
        services: [
          {
            storageSource: {
              bucket: "my-bucket",
              object: "test.zip",
            },
            deployResponse: {
              uri: "https://my-service.com",
            },
          },
        ],
      },
    };
    const context = {};
    const options = {} as any;

    await release(context, options, payload);

    expect(deleteObjectStub.calledOnce).to.be.true;
    expect(deleteObjectStub.firstCall.args[0]).to.equal("/my-bucket/test.zip");
  });
});
