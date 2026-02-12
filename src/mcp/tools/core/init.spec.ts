import { expect } from "chai";
import * as sinon from "sinon";
import { init } from "./init";
import * as initIndex from "../../../init/index";
import { toContent } from "../../util";
import { ServerToolContext } from "../../tool";

describe("init tool", () => {
  const projectId = "test-project";
  const baseConfig: any = {
    src: {},
    writeProjectFile: sinon.stub(),
  };
  const baseRc: any = { data: {} };

  let actuateStub: sinon.SinonStub;

  beforeEach(() => {
    actuateStub = sinon.stub(initIndex, "actuate");
    baseConfig.writeProjectFile.reset();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should initialize firestore", async () => {
    const features = { firestore: {} };
    await init.fn({ features }, { projectId, config: baseConfig, rc: baseRc } as ServerToolContext);

    expect(actuateStub).to.be.calledOnce;
    const setup = actuateStub.args[0][0];
    expect(setup.features).to.deep.equal(["firestore"]);
    expect(setup.featureInfo.firestore).to.exist;
    expect(baseConfig.writeProjectFile).to.be.calledTwice;
  });

  it("should initialize database", async () => {
    const features = { database: {} };
    await init.fn({ features }, { projectId, config: baseConfig, rc: baseRc } as ServerToolContext);

    expect(actuateStub).to.be.calledOnce;
    const setup = actuateStub.args[0][0];
    expect(setup.features).to.deep.equal(["database"]);
    expect(setup.featureInfo.database).to.exist;
  });

  it("should initialize dataconnect", async () => {
    const features = { dataconnect: {} };
    await init.fn({ features }, { projectId, config: baseConfig, rc: baseRc } as ServerToolContext);

    expect(actuateStub).to.be.calledOnce;
    const setup = actuateStub.args[0][0];
    expect(setup.features).to.deep.equal(["dataconnect"]);
    expect(setup.featureInfo.dataconnect).to.exist;
  });

  it("should ignore the storage feature", async () => {
    const features = { storage: {} };
    await init.fn({ features }, { projectId, config: baseConfig, rc: baseRc } as ServerToolContext);

    const setup = actuateStub.args[0][0];
    expect(setup.features).to.be.empty;
  });

  it("should initialize multiple features", async () => {
    const features = { firestore: {}, database: {} };
    await init.fn({ features }, { projectId, config: baseConfig, rc: baseRc } as ServerToolContext);

    const setup = actuateStub.args[0][0];
    expect(setup.features).to.have.members(["firestore", "database"]);
    expect(setup.featureInfo.firestore).to.exist;
    expect(setup.featureInfo.database).to.exist;
  });

  it("should return a success message", async () => {
    const features = { firestore: {} };
    const result = await init.fn({ features }, {
      projectId,
      config: baseConfig,
      rc: baseRc,
    } as any);
    expect(result).to.deep.equal(
      toContent(
        `Successfully setup the project ${projectId} with those features: firestore` +
          " To deploy them, you can run `firebase deploy` in command line.",
      ),
    );
  });
});
