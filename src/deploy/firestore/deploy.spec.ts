import { expect } from "chai";
import * as sinon from "sinon";
import deploy from "./deploy";
import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import { FirestoreApi } from "../../firestore/api";
import * as utils from "../../utils";
import { Options } from "../../options";

describe("firestore deploy", () => {
  let createRulesetsStub: sinon.SinonStub;
  let deployIndexesStub: sinon.SinonStub;
  let sleepStub: sinon.SinonStub;

  beforeEach(() => {
    createRulesetsStub = sinon.stub(RulesDeploy.prototype, "createRulesets").resolves();
    deployIndexesStub = sinon.stub(FirestoreApi.prototype, "deploy").resolves();
    sleepStub = sinon.stub(utils, "sleep").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should skip if no rules or indexes in context", async () => {
    const context = {};
    await deploy(context, {} as Options);
    expect(createRulesetsStub).to.not.have.been.called;
    expect(deployIndexesStub).to.not.have.been.called;
  });

  it("should deploy rules if context.firestoreRules is present", async () => {
    const context = {
      firestoreRules: true,
      firestore: {
        rulesDeploy: new RulesDeploy({} as Options, RulesetServiceType.CLOUD_FIRESTORE),
      },
    };

    await deploy(context, {} as Options);

    expect(createRulesetsStub).to.have.been.calledWith(RulesetServiceType.CLOUD_FIRESTORE);
  });

  it("should skip rules if rulesDeploy is missing", async () => {
    const context = {
      firestoreRules: true,
    };

    await deploy(context, {} as Options);

    expect(createRulesetsStub).to.not.have.been.called;
  });

  it("should deploy indexes if context.firestoreIndexes is present", async () => {
    const context = {
      firestoreIndexes: true,
      firestore: {
        indexes: [
          {
            databaseId: "(default)",
            indexesFileName: "firestore.indexes.json",
            indexesRawSpec: {
              indexes: [{ collectionGroup: "users", queryScope: "COLLECTION", fields: [] }],
            },
          },
        ],
      },
    };

    await deploy(context, {} as Options);

    expect(deployIndexesStub).to.have.been.calledOnce;
  });

  it("should retry index deployment on 404 error", async () => {
    const context = {
      firestoreIndexes: true,
      firestore: {
        indexes: [
          {
            databaseId: "(default)",
            indexesFileName: "firestore.indexes.json",
            indexesRawSpec: {
              indexes: [{ collectionGroup: "users", queryScope: "COLLECTION", fields: [] }],
            },
          },
        ],
      },
    };

    const notFoundError = Object.assign(new Error("Not found"), { status: 404 });

    deployIndexesStub.onFirstCall().rejects(notFoundError);
    deployIndexesStub.onSecondCall().resolves();

    await deploy(context, {} as Options);

    expect(deployIndexesStub).to.have.been.calledTwice;
    expect(sleepStub).to.have.been.calledOnce;
  });

  it("should bubble up non-404 errors during index deployment", async () => {
    const context = {
      firestoreIndexes: true,
      firestore: {
        indexes: [
          {
            databaseId: "(default)",
            indexesFileName: "firestore.indexes.json",
            indexesRawSpec: {
              indexes: [{ collectionGroup: "users", queryScope: "COLLECTION", fields: [] }],
            },
          },
        ],
      },
    };

    const genericError = Object.assign(new Error("Permission denied"), { status: 403 });

    deployIndexesStub.rejects(genericError);

    await expect(deploy(context, {} as Options)).to.be.rejectedWith("Permission denied");
  });
});
