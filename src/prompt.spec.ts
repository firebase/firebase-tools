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

      it("handles non-interactive with default", async () => {
        const result = await prompt.confirm({
          message: "Continue?",
          nonInteractive: true,
          default: false,
        });
        expect(result).to.be.false;
      });

      it("throws in non-interactive without default", async () => {
        await expect(
          prompt.confirm({
            message: "Continue?",
            nonInteractive: true,
          }),
        ).to.be.rejectedWith(
          FirebaseError,
          'Question "Continue?" does not have a default and cannot be answered in non-interactive mode',
        );
      });
    });

    describe("input", () => {
      it("handles non-interactive with default", async () => {
        const result = await prompt.input({
          message: "Name?",
          nonInteractive: true,
          default: "Inigo Montoya",
        });
        expect(result).to.equal("Inigo Montoya");
      });

      it("throws in non-interactive without default", async () => {
        await expect(
          prompt.input({
            message: "Name?",
            nonInteractive: true,
          }),
        ).to.be.rejectedWith(
          FirebaseError,
          'Question "Name?" does not have a default and cannot be answered in non-interactive mode',
        );
      });
    });

    describe("checkbox", () => {
      it("handles non-interactive with default", async () => {
        const result = await prompt.checkbox({
          message: "Tools?",
          nonInteractive: true,
          choices: ["hammer", "wrench", "saw"],
          default: ["hammer", "wrench"],
        });
        expect(result).to.deep.equal(["hammer", "wrench"]);
      });

      it("throws in non-interactive without default", async () => {
        await expect(
          prompt.checkbox({
            message: "Tools?",
            nonInteractive: true,
            choices: ["hammer", "wrench", "saw"],
          }),
        ).to.be.rejectedWith(
          FirebaseError,
          'Question "Tools?" does not have a default and cannot be answered in non-interactive mode',
        );
      });
    });

    describe("select", () => {
      it("handles non-interactive with default", async () => {
        const result = await prompt.select({
          message: "Tool?",
          nonInteractive: true,
          choices: ["hammer", "wrench", "saw"],
          default: "wrench",
        });
        expect(result).to.equal("wrench");
      });

      it("throws in non-interactive without default", async () => {
        await expect(
          prompt.select({
            message: "Tool?",
            nonInteractive: true,
            choices: ["hammer", "wrench", "saw"],
          }),
        ).to.be.rejectedWith(
          FirebaseError,
          'Question "Tool?" does not have a default and cannot be answered in non-interactive mode',
        );
      });
    });

    describe("number", () => {
      it("handles non-interactive with default", async () => {
        const result = await prompt.number({
          message: "Count?",
          nonInteractive: true,
          default: 42,
        });
        expect(result).to.equal(42);
      });

      it("throws in non-interactive without default", async () => {
        await expect(
          prompt.number({
            message: "Count?",
            nonInteractive: true,
          }),
        ).to.be.rejectedWith(
          FirebaseError,
          'Question "Count?" does not have a default and cannot be answered in non-interactive mode',
        );
      });
    });

    describe("password", () => {
      it("throws in non-interactive", async () => {
        await expect(
          prompt.password({
            message: "Password?",
            nonInteractive: true,
          }),
        ).to.be.rejectedWith(
          FirebaseError,
          'Question "Password?" does not have a default and cannot be answered in non-interactive mode',
        );
      });
    });

    describe("search", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const source = (term: string | undefined) => {
        return ["a", "b", "c"];
      };

      it("handles non-interactive with default", async () => {
        const result = await prompt.search({
          message: "Letter?",
          nonInteractive: true,
          source,
          default: "b",
        });
        expect(result).to.equal("b");
      });

      it("throws in non-interactive without default", async () => {
        await expect(
          prompt.search({
            message: "Letter?",
            nonInteractive: true,
            source,
          }),
        ).to.be.rejectedWith(
          FirebaseError,
          'Question "Letter?" does not have a default and cannot be answered in non-interactive mode',
        );
      });
    });
  });
});
