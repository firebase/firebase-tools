import { expect } from "chai";
import * as sinon from "sinon";
import { listFunctions } from "../../functions/listFunctions";
import * as backend from "../../deploy/functions/backend";
import * as args from "../../deploy/functions/args";
import { previews } from "../../previews";

describe("listFunctions", () => {
  let sandbox: sinon.SinonSandbox;
  let backendStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    backendStub = sandbox.stub(backend, "existingBackend");
    previews.functionsv2 = false;
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should return an empty array on empty function spec list", async () => {
    backendStub.returns(Promise.resolve({ cloudFunctions: [] }));

    const result = await listFunctions({ projectId: "project" } as args.Context);

    expect(result).to.deep.equal({ functions: [] });
  });

  it("should return the v1 functions in order", async () => {
    backendStub.returns(
      Promise.resolve({
        cloudFunctions: [
          {
            id: "fn2",
            entryPoint: "fn2",
            trigger: {
              eventType: "providers/firebase.database/eventTypes/ref.create",
            },
            platform: "gcfv1",
            region: "us-west1",
            availableMemoryMb: "256",
            runtime: "nodejs14",
          },
          {
            id: "fn1",
            entryPoint: "fn1",
            trigger: {},
            platform: "gcfv1",
            region: "us-west1",
            availableMemoryMb: "256",
            runtime: "nodejs14",
          },
        ],
      })
    );

    const result = await listFunctions({ projectId: "project" } as args.Context);

    expect(result).to.deep.equal({
      functions: [
        {
          id: "fn1",
          entryPoint: "fn1",
          trigger: {},
          platform: "gcfv1",
          region: "us-west1",
          availableMemoryMb: "256",
          runtime: "nodejs14",
        },
        {
          id: "fn2",
          entryPoint: "fn2",
          trigger: {
            eventType: "providers/firebase.database/eventTypes/ref.create",
          },
          platform: "gcfv1",
          region: "us-west1",
          availableMemoryMb: "256",
          runtime: "nodejs14",
        },
      ],
    });
  });

  it("should return the v1&v2 functions in order", async () => {
    previews.functionsv2 = true;
    backendStub.returns(
      Promise.resolve({
        cloudFunctions: [
          {
            id: "fn2",
            entryPoint: "fn2",
            trigger: {
              eventType: "providers/firebase.database/eventTypes/ref.create",
            },
            platform: "gcfv1",
            region: "us-west1",
            availableMemoryMb: "256",
            runtime: "nodejs14",
          },
          {
            id: "fn3",
            entryPoint: "fn3",
            trigger: {},
            platform: "gcfv2",
            region: "us-west1",
            availableMemoryMb: "256",
            runtime: "nodejs14",
          },
          {
            id: "fn1",
            entryPoint: "fn1",
            trigger: {},
            platform: "gcfv1",
            region: "us-west1",
            availableMemoryMb: "256",
            runtime: "nodejs14",
          },
        ],
      })
    );

    const result = await listFunctions({ projectId: "project" } as args.Context);

    expect(result).to.deep.equal({
      functions: [
        {
          id: "fn3",
          entryPoint: "fn3",
          trigger: {},
          platform: "gcfv2",
          region: "us-west1",
          availableMemoryMb: "256",
          runtime: "nodejs14",
        },
        {
          id: "fn1",
          entryPoint: "fn1",
          trigger: {},
          platform: "gcfv1",
          region: "us-west1",
          availableMemoryMb: "256",
          runtime: "nodejs14",
        },
        {
          id: "fn2",
          entryPoint: "fn2",
          trigger: {
            eventType: "providers/firebase.database/eventTypes/ref.create",
          },
          platform: "gcfv1",
          region: "us-west1",
          availableMemoryMb: "256",
          runtime: "nodejs14",
        },
      ],
    });
  });
});
