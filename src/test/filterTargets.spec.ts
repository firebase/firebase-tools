import { expect } from "chai";
import { filterTargets } from "../filterTargets";
import { Options } from "../options";
import { RC } from "../rc";

const SAMPLE_OPTIONS: Options = {
  cwd: "/",
  configPath: "/",
  /* eslint-disable-next-line */
  config: {} as any,
  only: "",
  except: "",
  nonInteractive: false,
  json: false,
  interactive: false,
  debug: false,
  force: false,
  filteredTargets: [],
  rc: new RC(),
};

const VALID_TARGETS = ["hosting", "functions"];

describe("filterTargets", () => {
  it("should leave targets alone if no filtering is specified", () => {
    const o = Object.assign(SAMPLE_OPTIONS, {
      config: {
        has: () => true,
      },
    });
    expect(filterTargets(o, VALID_TARGETS)).to.deep.equal(["hosting", "functions"]);
  });

  it("should filter targets from --only", () => {
    const o = Object.assign(SAMPLE_OPTIONS, {
      config: {
        has: () => true,
      },
      only: "hosting",
    });
    expect(filterTargets(o, VALID_TARGETS)).to.deep.equal(["hosting"]);
  });

  it("should filter out targets with --except", () => {
    const o = Object.assign(SAMPLE_OPTIONS, {
      config: {
        has: () => true,
      },
      except: "functions",
    });
    expect(filterTargets(o, VALID_TARGETS)).to.deep.equal(["hosting"]);
  });
});
