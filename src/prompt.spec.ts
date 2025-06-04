import { expect } from "chai";

import { FirebaseError } from "./error";
import * as prompt from "./prompt";

describe("prompt", () => {
  describe("guard", () => {
    it("returns default in non-interactive if present", () => {
      const { shouldReturn, value } = prompt.guard({
        message: "message",
        nonInteractive: true,
        default: 42,
      });
      expect(shouldReturn).to.be.true;
      expect(value).to.equal(42);
    });

    it("does not suggest returning if interactive", () => {
      const { shouldReturn, value } = prompt.guard({
        message: "message",
        nonInteractive: false,
        default: 42,
      });
      expect(shouldReturn).to.be.false;
      expect(value).to.be.undefined;
    });

    it("throws if non-interactive without default", () => {
      expect(() =>
        prompt.guard({
          message: "message",
          nonInteractive: true,
        }),
      ).to.throw(
        FirebaseError,
        'Question "message" does not have a default and cannot be answered in non-interactive mode',
      );
    });
  });

  // Note: We cannot actuall have test coverage that the APIs pass through to inquirer because it is ESM
  // and cannot be mocked.
  describe("query types", () => {
    describe("confirm", () => {
      it("handles force", async () => {
        const result = await prompt.confirm({
          message: "Continue?",
          default: false,
          force: true,
        });
        expect(result).to.be.true;
      });
    });
  });
});
