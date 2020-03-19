import { bold } from "cli-color";
import { CommanderStatic } from "commander";
import { first, last, get, size, head, keys, values } from "lodash";
import { SPLAT } from "triple-beam";
import * as winston from "winston";

import { FirebaseError } from "./error";
import { getInheritedOption } from "./utils";
import { load } from "./rc";
import { load as _load } from "./config";
import * as configstore from "./configstore";
import { detectProjectRoot } from "./detectProjectRoot";
import logger = require("./logger");
import track = require("./track");
const ansiStrip = require("cli-color/strip") as (input: string) => string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionFunction = (...args: any[]) => any;

interface BeforeFunction {
  fn: ActionFunction;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[];
}

interface CLIClient {
  cli: CommanderStatic;
  errorOut: (e: Error) => void;
}

/**
 * Command is a wrapper around commander to simplify our use of promise-based
 * actions and pre-action hooks.
 */
export class Command {
  private name = "";
  private descriptionText = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private options: any[][] = [];
  private actionFn: ActionFunction = (): void => {};
  private befores: BeforeFunction[] = [];
  private helpText = "";
  private client?: CLIClient;

  /**
   * @param cmd the command to create.
   */
  constructor(private cmd: string) {
    this.name = first(cmd.split(" ")) || "";
  }

  /**
   * Sets the description of the command.
   * @param t a human readable description.
   * @return the command, for chaining.
   */
  description(t: string): Command {
    this.descriptionText = t;
    return this;
  }

  /**
   * Sets any options for the command.
   *
   * @example
   *   command.option("-d, --debug", "turn on debugging", false)
   *
   * @param args the commander-style option definition.
   * @return the command, for chaining.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  option(...args: any[]): Command {
    this.options.push(args);
    return this;
  }

  /**
   * Attaches a function to run before the command's action function.
   * @param fn the function to run.
   * @param args arguments, as an array, for the function.
   * @return the command, for chaining.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  before(fn: ActionFunction, ...args: any[]): Command {
    this.befores.push({ fn: fn, args: args });
    return this;
  }

  /**
   * Sets the help text for the command.
   *
   * This text is displayed when:
   *   - the `--help` flag is passed to the command, or
   *   - the `help <command>` command is used.
   *
   * @param t the human-readable help text.
   * @return the command, for chaining.
   */
  help(t: string): Command {
    this.helpText = t;
    return this;
  }

  /**
   * Sets the function to be run for the command.
   * @param fn the function to be run.
   * @return the command, for chaining.
   */
  action(fn: ActionFunction): Command {
    this.actionFn = fn;
    return this;
  }

  /**
   * Registers the command with the client. This is used to inisially set up
   * all the commands and wraps their functionality with analytics and error
   * handling.
   * @param client the client object (from src/index.js).
   */
  register(client: CLIClient): void {
    this.client = client;
    const program = client.cli;
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

    // args is an array of all the arguments provided for the command PLUS the
    // options object as provided by Commander (on the end).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cmd.action((...args: any[]) => {
      const runner = this.runner();
      const start = new Date().getTime();
      const options = last(args);
      // We do not want to provide more arguments to the action functions than
      // we are able to - we're not sure what the ripple effects are. Our
      // action functions are supposed to be of the form (options, ...args)
      // where `...args` are the <required> and [optional] arguments of the
      // command. Therefore, if we check the number of arguments we have
      // against the number of arguments the action function has, we can error
      // out if we would provide too many.
      // TODO(bkendall): it would be nice to not depend on this internal
      //   property of Commander, but that's the limitation we have today. What
      //   we would like is the following:
      //   > if (args.length > this.actionFn.length)
      if (args.length - 1 > cmd._args.length) {
        client.errorOut(
          new FirebaseError(
            `Too many arguments. Run ${bold("firebase help " + this.name)} for usage instructions`,
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
   * Extends the options with various properties for use in commands.
   * @param options the command options object.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private prepare(options: any): void {
    options = options || {};
    options.project = getInheritedOption(options, "project");

    if (!process.stdin.isTTY || getInheritedOption(options, "nonInteractive")) {
      options.nonInteractive = true;
    }
    // allow override of detected non-interactive with --interactive flag
    if (getInheritedOption(options, "interactive")) {
      options.interactive = true;
      options.nonInteractive = false;
    }

    if (getInheritedOption(options, "debug")) {
      options.debug = true;
    }

    if (getInheritedOption(options, "json")) {
      options.nonInteractive = true;
    } else {
      if (process.env.DEBUG) {
        logger.add(
          new winston.transports.Console({
            level: "debug",
            format: winston.format.printf((info) => {
              const segments = [info.message, ...(info[SPLAT] || [])].map(logger.tryStringify);
              return `${ansiStrip(segments.join(" "))}`;
            }),
          })
        );
      } else if (process.env.IS_FIREBASE_CLI) {
        logger.add(
          new winston.transports.Console({
            level: "info",
            format: winston.format.printf((info) =>
              [info.message, ...(info[SPLAT] || [])].join(" ")
            ),
          })
        );
      }
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
   * @param options the command options object.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyRC(options: any): void {
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
   * Returns an async function that calls the pre-action hooks and then the
   * command's action function.
   * @return an async function that executes the command.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runner(): (...a: any[]) => Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (...args: any[]) => {
      // always provide at least an empty object for options
      if (args.length === 0) {
        args.push({});
      }
      const options = last(args);
      this.prepare(options);
      for (const before of this.befores) {
        await before.fn(options, ...before.args);
      }
      return this.actionFn(...args);
    };
  }
}
