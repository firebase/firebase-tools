import { expect } from "chai";
import { Config } from "./config.js";
import { FirebaseError } from "./error.js";
import { Options } from "./options.js";
import { RC } from "./rc.js";
import { requireConfig } from "./requireConfig.js";
import { cloneDeep } from "./utils.js";

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
