import { expect } from "chai";
import * as sinon from "sinon";
import { requireHostingSite } from "./requireHostingSite";
import * as hosting from "./getDefaultHostingSite";

describe("requireHostingSite", () => {
  let getDefaultHostingSiteStub: sinon.SinonStub;

  beforeEach(() => {
    getDefaultHostingSiteStub = sinon.stub(hosting, "getDefaultHostingSite");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should do nothing if options.site is already set", async () => {
    const options = { site: "my-site" };
    await requireHostingSite(options);
    expect(options.site).to.equal("my-site");
    expect(getDefaultHostingSiteStub).to.not.have.been.called;
  });

  it("should call getDefaultHostingSite if options.site is not set", async () => {
    const options = {};
    getDefaultHostingSiteStub.resolves("default-site");
    await requireHostingSite(options);
    expect(getDefaultHostingSiteStub).to.have.been.calledOnce;
  });

  it("should set options.site to the value returned by getDefaultHostingSite", async () => {
    const options: { site?: string } = {};
    getDefaultHostingSiteStub.resolves("default-site");
    await requireHostingSite(options);
    expect(options.site).to.equal("default-site");
  });

  it("should not throw an error if getDefaultHostingSite resolves", async () => {
    const options = {};
    getDefaultHostingSiteStub.resolves("default-site");
    await expect(requireHostingSite(options)).to.be.fulfilled;
  });
});
