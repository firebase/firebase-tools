
import { expect } from "chai";
import * as sinon from "sinon";
import deploy from "./deploy";
import * as utils from "../../utils";
import * as api from "../../firestore/api";

describe("deployIndexes", () => {
  let sandbox: sinon.SinonSandbox;
  let context: any;
  let options: any;
  let logBulletStub: sinon.SinonStub;
  let logSuccessStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    context = {};
    options = { config: { path: (p: string) => p, data: { firestore: {} } } };
    logBulletStub = sandbox.stub(utils, "logBullet");
    logSuccessStub = sandbox.stub(utils, "logSuccess");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should not crash if context.firestore.indexes is undefined", async () => {
    context.firestoreIndexes = true;
    context.firestore = {};

    await deploy(context, options);

    expect(logBulletStub.called).to.be.false;
  });

  it("should deploy indexes if context.firestore.indexes is defined", async () => {
    context.firestoreIndexes = true;
    context.firestore = {
        indexes: [
            {
                databaseId: "(default)",
                indexesFileName: "firestore.indexes.json",
                indexesRawSpec: { indexes: [] }
            }
        ]
    };
    const apiStub = sandbox.stub(api.FirestoreApi.prototype, "deploy").resolves();

    await deploy(context, options);

    expect(apiStub.called).to.be.true;
  });
});
