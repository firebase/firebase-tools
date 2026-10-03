import { expect } from "chai";
import { Command as Program } from "commander";
import * as sinon from "sinon";
import * as rc from "./rc";
import nock from "./test/helpers/nock";
import { configstore } from "./configstore";

import {
  argvWithCommandFirst,
  CLIClient,
  Command,
  findCommandIndex,
  validateProjectId,
} from "./command";
import { FirebaseError } from "./error";

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
      command.alias("example2");
      command.help("here's how!");
      command.action(() => {
        // do nothing
      });
    }).not.to.throw();
  });

  it("should not mutate its options when registered more than once", () => {
    command.option("-x, --foobar", "description", "value");
    command.withForce();

    // A fresh client (commander program) per registration mirrors firebase-tools
    // being imported as a module and used across multiple CLI invocations, where
    // each runner re-registers the same cached command instance (see
    // src/commands/index.ts).
    const makeClient = () => ({ cli: new Program() }) as CLIClient;

    // register() used to shift the flags out of each stored option array, so
    // repeated registration eventually passed `undefined` to commander and threw
    // `Cannot read properties of undefined (reading 'indexOf')`.
    expect(() => {
      command.register(makeClient());
      command.register(makeClient());
      command.register(makeClient());
    }).not.to.throw();

    // The stored option definitions must be preserved across registrations.
    expect((command as unknown as { options: unknown[][] }).options).to.deep.equal([
      ["-x, --foobar", "description", "value"],
      ["-f, --force", "automatically accept all interactive prompts"],
    ]);
  });

  describe("runner", () => {
    let rcStub: sinon.SinonStub;
    let configstoreStub: sinon.SinonStub;

    beforeEach(() => {
      configstoreStub = sinon.stub(configstore, "get").returns({});
      rcStub = sinon
        .stub(rc, "loadRC")
        .returns(new rc.RC(undefined, { projects: { default: "default-project" } }));
    });

    afterEach(() => {
      rcStub.restore();
      configstoreStub.restore();
      nock.cleanAll();
    });

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
      nock("https://cloudresourcemanager.googleapis.com").get("/v1/projects/12345678").reply(200, {
        projectNumber: "12345678",
        projectId: "resolved-project",
      });
      nock("https://serviceusage.googleapis.com")
        .get("/v1/projects/12345678/services/cloudresourcemanager.googleapis.com")
        .reply(200, {
          state: "ENABLED",
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

    it("should use the 'default' alias if no project is passed", async () => {
      const run = command
        .action((options) => {
          return {
            project: options.project,
            projectNumber: options.projectNumber,
            projectId: options.projectId,
          };
        })
        .runner();

      const result = await run({});
      expect(result).to.deep.eq({
        projectId: "default-project",
        projectNumber: undefined,
        project: "default-project",
      });
    });
  });

  it("should handle comma separated values in 'only' options", async () => {
    const run = command
      .action((options) => {
        return {
          only: options.only,
        };
      })
      .runner();

    const result = await run({
      only: "firestore,hosting,auth",
    });

    expect(result).to.deep.eq({
      only: "firestore,hosting,auth",
    });
  });

  it("should normalize space separated values in 'only' options", async () => {
    const run = command
      .action((options) => {
        return {
          only: options.only,
        };
      })
      .runner();

    const result = await run({
      only: "firestore hosting auth",
    });

    expect(result).to.deep.eq({
      only: "firestore,hosting,auth",
    });
  });

  it("should normalize space and commas separated values in 'only' options", async () => {
    const run = command
      .action((options) => {
        return {
          only: options.only,
        };
      })
      .runner();

    const result = await run({
      only: "firestore, hosting,  auth",
    });

    expect(result).to.deep.eq({
      only: "firestore,hosting,auth",
    });
  });

  it("should normalize space and commas separated values in 'except' options", async () => {
    const run = command
      .action((options) => {
        return {
          except: options.except,
        };
      })
      .runner();

    const result = await run({
      except: "firestore, hosting,  auth",
    });

    expect(result).to.deep.eq({
      except: "firestore,hosting,auth",
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

describe("findCommandIndex", () => {
  const bin = ["node", "firebase"];
  const flags = ["-P", "--project", "-m", "--message", "--instance"];

  it("finds a command that already comes first", () => {
    expect(findCommandIndex([...bin, "deploy", "--only", "hosting"], "deploy", flags)).to.equal(2);
  });

  it("finds a command after options and their values", () => {
    const argv = [...bin, "--project", "p", "--instance", "foo", "database:get", "/"];
    expect(findCommandIndex(argv, "database:get", flags)).to.equal(6);
  });

  it("skips an option value that equals the command name", () => {
    const argv = [...bin, "--project", "deploy", "--debug", "deploy", "--only", "hosting"];
    expect(findCommandIndex(argv, "deploy", flags)).to.equal(5);
  });

  it("does not treat a command option's value as the command", () => {
    expect(findCommandIndex([...bin, "--message", "deploy", "release"], "deploy", flags)).to.equal(
      -1,
    );
  });

  it("skips the value of a value-taking flag in combined short flags", () => {
    const argv = [...bin, "-jP", "deploy", "--debug", "deploy", "--only", "hosting"];
    expect(findCommandIndex(argv, "deploy", flags)).to.equal(5);
  });

  it("treats the rest of a combined short flag as its value", () => {
    expect(findCommandIndex([...bin, "-jPdeploy", "deploy"], "deploy", flags)).to.equal(3);
  });

  it("does not read a value after --option=value", () => {
    expect(findCommandIndex([...bin, "--project=p", "deploy"], "deploy", flags)).to.equal(3);
  });

  it("ignores anything after --", () => {
    expect(findCommandIndex([...bin, "--", "-P", "deploy"], "deploy", flags)).to.equal(-1);
  });
});

describe("argvWithCommandFirst", () => {
  it("moves the argument at the index in front of the options before it", () => {
    const argv = ["node", "firebase", "--project", "p", "--instance", "foo", "database:get", "/"];
    expect(argvWithCommandFirst(argv, 6)).to.deep.equal([
      "node",
      "firebase",
      "database:get",
      "--project",
      "p",
      "--instance",
      "foo",
      "/",
    ]);
  });

  it("leaves argv unchanged when the command is already first", () => {
    const argv = ["node", "firebase", "deploy", "--only", "hosting"];
    expect(argvWithCommandFirst(argv, 2)).to.deep.equal(argv);
  });
});
