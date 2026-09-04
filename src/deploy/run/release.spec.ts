import { expect } from "chai";
import * as sinon from "sinon";
import { release } from "./release";
import { logger } from "../../logger";
import { Options } from "../../options";
import { Context, Payload } from "./args";

describe("run release", () => {
  let loggerInfoStub: sinon.SinonStub;

  beforeEach(() => {
    loggerInfoStub = sinon.stub(logger, "info");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should do nothing if payload.run or payload.run.services is undefined", async () => {
    const payload: Payload = {};
    const context: Context = {};
    const options = {} as Options;

    await release(context, options, payload);

    expect(loggerInfoStub.notCalled).to.be.true;
  });

  it("should log service URL when deployResponse.uri exists", async () => {
    const payload: Payload = {
      run: {
        services: [
          {
            serviceId: "my-service",
            region: "us-central1",
            source: ".",
            ignore: [],
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

    expect(
      loggerInfoStub.calledOnceWith("Service my-service is available at https://my-service.com"),
    ).to.be.true;
  });
});
