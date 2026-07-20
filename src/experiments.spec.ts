import { expect } from "chai";
import { enableExperimentsFromCliEnvVariable, isEnabled, setEnabled } from "./experiments";

describe("experiments", () => {
  let originalCLIState = process.env.FIREBASE_CLI_EXPERIMENTS;

  before(() => {
    originalCLIState = process.env.FIREBASE_CLI_EXPERIMENTS;
  });

  beforeEach(() => {
    process.env.FIREBASE_CLI_EXPERIMENTS = originalCLIState;
  });

  afterEach(() => {
    process.env.FIREBASE_CLI_EXPERIMENTS = originalCLIState;
  });

  describe("enableExperimentsFromCliEnvVariable", () => {
    it("should enable some experiments", () => {
      expect(isEnabled("experiments")).to.be.false;
      process.env.FIREBASE_CLI_EXPERIMENTS = "experiments,not_an_experiment";

      enableExperimentsFromCliEnvVariable();

      expect(isEnabled("experiments")).to.be.true;
      setEnabled("experiments", false);
    });

    it("should disable experiments when prefixed with hyphen in env var", () => {
      setEnabled("extdeprecationwarnings", true);
      expect(isEnabled("extdeprecationwarnings")).to.be.true;

      process.env.FIREBASE_CLI_EXPERIMENTS = "-extdeprecationwarnings";
      enableExperimentsFromCliEnvVariable();

      expect(isEnabled("extdeprecationwarnings")).to.be.false;
      setEnabled("extdeprecationwarnings", null);
    });
  });
});
