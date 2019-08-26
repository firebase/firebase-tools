import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../error";
import { generateInstanceId } from "../../extensions/generateInstanceId";
import * as modsApi from "../../extensions/modsApi";

const TEST_NAME = "image-resizer";

describe("generateInstanceId", () => {
  let getInstanceStub: sinon.SinonStub;

  beforeEach(() => {
    getInstanceStub = sinon.stub(modsApi, "getInstance");
  });

  afterEach(() => {
    getInstanceStub.restore();
  });

  it("should return modSpec.name if no mod with that name exists yet", async () => {
    getInstanceStub.resolves({ error: { code: 404 } });

    const instanceId = await generateInstanceId("proj", TEST_NAME);
    expect(instanceId).to.equal(TEST_NAME);
  });

  it("should return modSpec.name plus a random string if a mod named modSpec.name exists", async () => {
    getInstanceStub.resolves({ name: TEST_NAME });

    const instanceId = await generateInstanceId("proj", TEST_NAME);
    expect(instanceId).to.include(TEST_NAME);
    expect(instanceId.length).to.equal(TEST_NAME.length + 5);
  });

  it("should throw if it gets an unexpected error response from getInstance", async () => {
    getInstanceStub.resolves({ error: { code: 500 } });

    await expect(generateInstanceId("proj", TEST_NAME)).to.be.rejectedWith(
      FirebaseError,
      "Unexpected error when generating instance ID:"
    );
  });
});
