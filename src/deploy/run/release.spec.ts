import { expect } from "chai";
import * as sinon from "sinon";
import { release } from "./release";
import * as gcs from "../../gcp/storage";
import { logger } from "../../logger";
import { Options } from "../../options";
import { Context, Payload } from "./args";

describe("run release", () => {
  let deleteObjectStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;
  let loggerDebugStub: sinon.SinonStub;

  beforeEach(() => {
    deleteObjectStub = sinon.stub(gcs, "deleteObject").resolves();
    loggerInfoStub = sinon.stub(logger, "info");
    loggerDebugStub = sinon.stub(logger, "debug");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should do nothing if payload.run or payload.run.services is undefined", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {} as Options;

    await release(context, options, payload);

    expect(deleteObjectStub.notCalled).to.be.true;
    expect(loggerInfoStub.notCalled).to.be.true;
  });

  it("should delete staging objects and log service URL", async () => {
    const payload: Payload = {
      run: {
        services: [
          {
            serviceId: "my-service",
            region: "us-central1",
            source: ".",
            ignore: [],
            storageSource: {
              bucket: "my-bucket",
              object: "test.zip",
            },
            deployResponse: {
              name: "projects/p/locations/us-central1/services/my-service",
              generation: 1,
              createTime: "now",
              updateTime: "now",
              creator: "user",
              lastModifier: "user",
              etag: "123",
              template: {},
              uri: "https://my-service.com",
            },
          },
        ],
      },
    };
    const context: Context = {};
    const options = {} as Options;

    await release(context, options, payload);

    expect(deleteObjectStub.calledOnce).to.be.true;
    expect(deleteObjectStub.firstCall.args[0]).to.equal("/my-bucket/test.zip");
    expect(
      loggerInfoStub.calledOnceWith("Service my-service is available at https://my-service.com"),
    ).to.be.true;
  });

  it("should handle GCS deletion errors gracefully without failing release", async () => {
    deleteObjectStub.rejects(new Error("GCS deletion failed"));

    const payload: Payload = {
      run: {
        services: [
          {
            serviceId: "my-service",
            region: "us-central1",
            source: ".",
            ignore: [],
            storageSource: {
              bucket: "my-bucket",
              object: "test.zip",
            },
          },
        ],
      },
    };
    const context: Context = {};
    const options = {} as Options;

    await release(context, options, payload);

    expect(deleteObjectStub.calledOnce).to.be.true;
    expect(loggerDebugStub.called).to.be.true;
  });
});
