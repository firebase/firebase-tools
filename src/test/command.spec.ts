import { expect } from "chai";

import { Command } from "../command";

describe("Command", () => {
  let command: Command;

  beforeEach(() => {
    command = new Command("example");
  });

  it("should allow all basic behavior", () => {
    expect(() => {
      command.description("description!");
      command.option("-f, --foobar", "description", "value");
      command.before(
        (arr: string[]) => {
          return arr;
        },
        ["foo", "bar"]
      );
      command.help("here's how!");
      command.action(() => {});
    }).not.to.throw;
  });

  describe("runner", () => {
    it("should work when no arguments are passed and options", async () => {
      const run = command
        .action((options) => {
          options.foo = "bar";
          return options;
        })
        .runner();

      const result = run({ foo: "baz" });
      await expect(result).to.eventually.have.property("foo", "bar");
    });

    it("should execute befores before the action", async () => {
      const run = command
        .before((options) => {
          options.foo = true;
        })
        .action((options) => {
          if (options.foo) {
            options.bar = "baz";
          }
          return options;
        })
        .runner();

      const result = run({});
      await expect(result).to.eventually.have.property("bar");
    });

    it("should terminate execution if a before errors", async () => {
      const run = command
        .before(() => {
          throw new Error("foo");
        })
        .action(() => {
          throw new Error("THIS IS NOT FOO");
        })
        .runner();

      const result = run();
      return expect(result).to.be.rejectedWith("foo");
    });

    it("should reject the promise if an error is thrown", async () => {
      const run = command
        .action(() => {
          throw new Error("foo");
        })
        .runner();

      const result = run();
      await expect(result).to.be.rejectedWith("foo");
    });
  });
});
