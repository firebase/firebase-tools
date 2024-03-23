import { expect } from "chai";

import { Options } from "../options";
import { RC } from "../rc";

import { checkValidTargetFilters } from "../checkValidTargetFilters";

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
const UNFILTERABLE_TARGETS = ["remoteconfig", "extensions"];

describe("checkValidTargetFilters", () => {
  it("should resolve", async () => {
    const options = Object.assign(SAMPLE_OPTIONS, {
      only: "functions",
    });
    await expect(checkValidTargetFilters(options)).to.be.fulfilled;
  });

  it("should resolve if there are no 'only' targets specified", async () => {
    const options = Object.assign(SAMPLE_OPTIONS, {
      only: null,
    });
    await expect(checkValidTargetFilters(options)).to.be.fulfilled;
  });

  it("should error if an only option and except option have been provided", async () => {
    const options = Object.assign(SAMPLE_OPTIONS, {
      only: "functions",
      except: "hosting",
    });
    await expect(checkValidTargetFilters(options)).to.be.rejectedWith(
      "Cannot specify both --only and --except",
    );
  });

  UNFILTERABLE_TARGETS.forEach((target) => {
    it(`should error if non-filter-type target (${target}) has filters`, async () => {
      const options = Object.assign(SAMPLE_OPTIONS, {
        only: `${target}:filter`,
        except: null,
      });
      await expect(checkValidTargetFilters(options)).to.be.rejectedWith(
        /Filters specified with colons \(e.g. --only functions:func1,functions:func2\) are only supported for .*/,
      );
    });
  });

  it("should error if the same target is specified with and without a filter", async () => {
    const options = Object.assign(SAMPLE_OPTIONS, {
      only: "functions,functions:filter",
    });
    await expect(checkValidTargetFilters(options)).to.be.rejectedWith(
      'Cannot specify "--only functions" and "--only functions:<filter>" at the same time',
    );
  });
});
