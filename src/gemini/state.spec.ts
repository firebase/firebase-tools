import { expect } from "chai";
import * as sinon from "sinon";
import { configstore } from "../configstore";
import { getNeverAskAgain, setNeverAskAgain, NEVER_ASK_AGAIN_KEY } from "./state";

describe("gemini state", () => {
  let getStub: sinon.SinonStub;
  let setStub: sinon.SinonStub;

  beforeEach(() => {
    getStub = sinon.stub(configstore, "get");
    setStub = sinon.stub(configstore, "set");
  });

  afterEach(() => {
    getStub.restore();
    setStub.restore();
  });

  describe("getNeverAskAgain", () => {
    it("should call configstore.get with the correct key", () => {
      getNeverAskAgain();
      expect(getStub).to.have.been.calledWith(NEVER_ASK_AGAIN_KEY);
    });

    it("should return true if configstore value is true", () => {
      getStub.withArgs(NEVER_ASK_AGAIN_KEY).returns(true);
      expect(getNeverAskAgain()).to.be.true;
    });

    it("should return false if configstore value is false or undefined", () => {
      getStub.withArgs(NEVER_ASK_AGAIN_KEY).returns(false);
      expect(getNeverAskAgain()).to.be.false;

      getStub.withArgs(NEVER_ASK_AGAIN_KEY).returns(undefined);
      expect(getNeverAskAgain()).to.be.false;
    });
  });

  describe("setNeverAskAgain", () => {
    it("should call configstore.set with the correct key and value", () => {
      setNeverAskAgain(true);
      expect(setStub).to.have.been.calledWith(NEVER_ASK_AGAIN_KEY, true);

      setNeverAskAgain(false);
      expect(setStub).to.have.been.calledWith(NEVER_ASK_AGAIN_KEY, false);
    });
  });
});
