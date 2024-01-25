import { expect } from "chai";
import * as nock from "nock";

import { Command, validateProjectId } from "../command";
import { FirebaseError } from "../error";

describe("Command", () => {
  let command: Command;

  beforeEach(() => {
    command = new Command("example");
  });

  it("should allow all basic behavior", () => {
    expect(() => {
      command.description("description!");
      command.option("-x, --foobar", "description", "value");
      command.withForce();
      command.before(
        (arr: string[]) => {
          return arr;
        },
        ["foo", "bar"],
      );
      command.help("here's how!");
      command.action(() => {
        // do nothing
      });
    }).not.to.throw();
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

    it("should resolve a numeric --project flag into a project id", async () => {
      nock("https://firebase.googleapis.com").get("/v1beta1/projects/12345678").reply(200, {
        projectNumber: "12345678",
        projectId: "resolved-project",
      });

      const run = command
        .action((options) => {
          return {
            project: options.project,
            projectNumber: options.projectNumber,
            projectId: options.projectId,
          };
        })
        .runner();

      const result = await run({ project: "12345678", token: "thisisatoken" });
      expect(result).to.deep.eq({
        projectId: "resolved-project",
        projectNumber: "12345678",
        project: "12345678",
      });
    });

    it("should resolve a non-numeric --project flag into a project id", async () => {
      const run = command
        .action((options) => {
          return {
            project: options.project,
            projectNumber: options.projectNumber,
            projectId: options.projectId,
          };
        })
        .runner();

      const result = await run({ project: "resolved-project" });
      expect(result).to.deep.eq({
        projectId: "resolved-project",
        projectNumber: undefined,
        project: "resolved-project",
      });
    });
  });
});

describe("validateProjectId", () => {
  it("should not throw for valid project ids", () => {
    expect(() => validateProjectId("example")).not.to.throw();
    expect(() => validateProjectId("my-project")).not.to.throw();
    expect(() => validateProjectId("myproject4fun")).not.to.throw();
  });

  it("should not throw for legacy project ids", () => {
    // The project IDs below are not technically valid, but some legacy projects
    // may have IDs like that. We should not block these.
    // https://cloud.google.com/resource-manager/reference/rest/v1beta1/projects#resource:-project
    expect(() => validateProjectId("example-")).not.to.throw();
    expect(() => validateProjectId("0123456")).not.to.throw();
    expect(() => validateProjectId("google.com:some-project")).not.to.throw();
  });

  it("should block invalid project ids", () => {
    expect(() => validateProjectId("EXAMPLE")).to.throw(FirebaseError, /Invalid project id/);
    expect(() => validateProjectId("!")).to.throw(FirebaseError, /Invalid project id/);
    expect(() => validateProjectId("with space")).to.throw(FirebaseError, /Invalid project id/);
    expect(() => validateProjectId(" leadingspace")).to.throw(FirebaseError, /Invalid project id/);
    expect(() => validateProjectId("trailingspace ")).to.throw(FirebaseError, /Invalid project id/);
    expect(() => validateProjectId("has.dot")).to.throw(FirebaseError, /Invalid project id/);
  });

  it("should error with additional note for uppercase project ids", () => {
    expect(() => validateProjectId("EXAMPLE")).to.throw(FirebaseError, /lowercase/);
    expect(() => validateProjectId("Example")).to.throw(FirebaseError, /lowercase/);
    expect(() => validateProjectId("Example-Project")).to.throw(FirebaseError, /lowercase/);
  });
});
