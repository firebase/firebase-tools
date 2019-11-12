import { first, last, get, size, head, keys, values } from "lodash";
import { bold } from "cli-color";

import { FirebaseError } from "./error";
import { getInheritedOption } from "./utils";
import { load } from "./rc";
import { load as _load } from "./config";
import * as configstore from "./configstore";
import detectProjectRoot = require("./detectProjectRoot");
import logger = require("./logger");
import track = require("./track");
import { CommanderStatic } from "commander";

interface BeforeFunction {
  fn: (...opts: any[]) => void;
  args: any[];
}

/**
 *
 */
export default class Command {
  private name = "";
  private descriptionText = "";
  private options: any[][];
  private actionFn = (...args: any[]): void => {};
  private befores: BeforeFunction[];
  private helpText = "";
  private client: any;

  /**
   *
   * @param cmd the command to create.
   */
  constructor(private cmd: string) {
    this.name = first(cmd.split(" ")) || "";
    this.options = [];
    this.befores = [];
  }

  /**
   *
   * @param args
   */
  description(t: string): Command {
    this.descriptionText = t;
    return this;
  }

  /**
   *
   * @param args
   */
  option(...args: any[]): Command {
    this.options.push(args);
    return this;
  }

  /**
   *
   * @param fn
   * @param args
   */
  before(fn: (...args: any[]) => void, ...args: any[]): Command {
    this.befores.push({
      fn: fn,
      args: args,
    });
    return this;
  }

  /**
   *
   * @param helpText
   */
  help(t: string): Command {
    this.helpText = t;
    return this;
  }

  /**
   *
   * @param fn
   */
  action(fn: (...args: any[]) => void): Command {
    this.actionFn = fn;
    return this;
  }

  /**
   *
   * @param client
   */
  register(client: any) {
    this.client = client;
    const program: CommanderStatic = client.cli;
    const cmd = program.command(this.cmd);
    if (this.descriptionText) {
      cmd.description(this.descriptionText);
    }
    this.options.forEach((args) => {
      const flags = args.shift();
      cmd.option(flags, ...args);
    });

    if (this.helpText) {
      cmd.on("--help", () => {
        console.log(this.helpText);
      });
    }

    cmd.action((...args: any[]) => {
      const runner = this.runner();
      const start = new Date().getTime();
      const options = last(args);
      const argCount = cmd._args.length;
      if (args.length - 1 > argCount) {
        client.errorOut(
          new FirebaseError(
            `Too many arguments. Run ${bold("firebase help " + cmd._name)} for usage instructions`,
            { exit: 1 }
          )
        );
        return;
      }

      runner(...args)
        .then((result) => {
          if (getInheritedOption(options, "json")) {
            console.log(
              JSON.stringify(
                {
                  status: "success",
                  result: result,
                },
                null,
                2
              )
            );
          }
          const duration = new Date().getTime() - start;
          track(this.name, "success", duration).then(process.exit);
        })
        .catch(async (err) => {
          if (getInheritedOption(options, "json")) {
            console.log(
              JSON.stringify(
                {
                  status: "error",
                  error: err.message,
                },
                null,
                2
              )
            );
          }
          const duration = Date.now() - start;
          const errorEvent = err.exit === 1 ? "Error (User)" : "Error (Unexpected)";

          await Promise.all([track(this.name, "error", duration), track(errorEvent, "", duration)]);
          client.errorOut(err);
        });
    });
  }

  /**
   *
   * @param options
   */
  private prepare(options: any): void {
    options = options || {};
    options.project = getInheritedOption(options, "project");

    if (!process.stdin.isTTY || getInheritedOption(options, "nonInteractive")) {
      options.nonInteractive = true;
    }
    // allow override of detected non-interactive with --interactive flag
    if (getInheritedOption(options, "interactive")) {
      options.nonInteractive = false;
    }

    if (getInheritedOption(options, "debug")) {
      logger.transports.console.level = "debug";
      options.debug = true;
    }
    if (getInheritedOption(options, "json")) {
      options.nonInteractive = true;
      logger.transports.console.level = "none";
    }

    try {
      options.config = _load(options);
    } catch (e) {
      options.configError = e;
    }

    options.projectRoot = detectProjectRoot(options.cwd);
    this.applyRC(options);
  }

  /**
   * Apply configuration from .firebaserc files in the working directory tree.
   *
   * @param options
   */
  applyRC(options: any): void {
    const rc = load(options.cwd);
    options.rc = rc;

    options.project =
      options.project || (configstore.get("activeProjects") || {})[options.projectRoot];
    // support deprecated "firebase" key in firebase.json
    if (options.config && !options.project) {
      options.project = options.config.defaults.project;
    }

    const aliases = rc.projects;
    const rcProject = get(aliases, options.project);
    if (rcProject) {
      options.projectAlias = options.project;
      options.project = rcProject;
    } else if (!options.project && size(aliases) === 1) {
      options.projectAlias = head(keys(aliases));
      options.project = head(values(aliases));
    }
  }

  /**
   *
   */
  runner(): (...a: any[]) => Promise<void> {
    return async (...args: any[]) => {
      // always provide at least an empty object for options
      if (args.length === 0) {
        args.push({});
      }
      const options = last(args);
      this.prepare(options);
      for (const before of this.befores) {
        await before.fn(options, before.args);
      }
      return this.actionFn(...args);
    };
  }
}
