import { expect } from "chai";
import { Config } from "../config";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { RC } from "../rc";
import { requireConfig } from "../requireConfig";
import { cloneDeep } from "../utils";

const options: Options = {
  cwd: "",
  configPath: "",
  only: "",
  except: "",
  config: new Config({}),
  filteredTargets: [],
  force: false,
  json: false,
  nonInteractive: false,
  interactive: false,
  debug: false,
  rc: new RC(),
};

describe("requireConfig", () => {
  it("should resolve if config exists", async () => {
    // This returns nothing to test - it just should not throw.
    await requireConfig(options);
  });

  it("should fail if config does not exist", async () => {
    const o: unknown = cloneDeep(options);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    delete (o as any).config;
    await expect(requireConfig(o as Options)).to.eventually.be.rejectedWith(
      FirebaseError,
      /Not in a Firebase project directory/,
    );
  });

  it("should return the existing configError if one is set", async () => {
    const o = cloneDeep(options);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    delete (o as any).config;
    o.configError = new Error("This is a config error.");
    await expect(requireConfig(o)).to.eventually.be.rejectedWith(Error, /This is a config error./);
  });
});
