import { expect } from "chai";
import requireInteractive from "./requireInteractive";
import { FirebaseError } from "./error";
import { Options } from "./options";

describe("requireInteractive", () => {
  it("should resolve if options.nonInteractive is false", async () => {
    const options = { nonInteractive: false } as Options;
    await expect(requireInteractive(options)).to.be.fulfilled;
  });

  it("should resolve if options.nonInteractive is undefined", async () => {
    const options = {} as Options;
    await expect(requireInteractive(options)).to.be.fulfilled;
  });

  it("should reject with a FirebaseError if options.nonInteractive is true", async () => {
    const options = { nonInteractive: true } as Options;
    await expect(requireInteractive(options)).to.be.rejectedWith(
      FirebaseError,
      "This command cannot run in non-interactive mode",
    );
  });
});
