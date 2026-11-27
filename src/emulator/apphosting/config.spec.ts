import * as sinon from "sinon";
import { expect } from "chai";
import { getLocalAppHostingConfiguration } from "./config";
import * as configImport from "../../apphosting/config";
import { AppHostingYamlConfig } from "../../apphosting/yaml";

describe("getLocalAppHostingConfiguration", () => {
  let getAppHostingConfigurationStub: sinon.SinonStub;

  beforeEach(() => {
    getAppHostingConfigurationStub = sinon.stub(configImport, "getAppHostingConfiguration");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("should delegate to getAppHostingConfiguration", async () => {
    const fakeConfig = AppHostingYamlConfig.empty();
    fakeConfig.env = { test: { value: "value" } };
    getAppHostingConfigurationStub.resolves(fakeConfig);

    const result = await getLocalAppHostingConfiguration("./backend");

    expect(getAppHostingConfigurationStub).to.have.been.calledWith("./backend");
    expect(result).to.equal(fakeConfig);
  });
});
