import * as inquirer from "inquirer";
import AutocompletePrompt from "inquirer-autocomplete-prompt";

import { fileExistsSync, dirExistsSync } from "./fsutils";
import { FirebaseError } from "./error";
import { Config } from "./config";
import { logger } from "./logger";

declare module "inquirer" {
  interface QuestionMap<T> {
    autocomplete: AutocompletePrompt.AutocompleteQuestionOptions<T>;
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-argument
inquirer.registerPrompt("autocomplete", require("inquirer-autocomplete-prompt"));

/**
 * Question type for inquirer. See
 * https://www.npmjs.com/package/inquirer#question
 */
export type Question = inquirer.DistinctQuestion;

type QuestionsThatReturnAString<T extends inquirer.Answers> =
  | inquirer.RawListQuestion<T>
  | inquirer.ExpandQuestion<T>
  | inquirer.InputQuestion<T>
  | inquirer.PasswordQuestion<T>
  | inquirer.EditorQuestion<T>
  | AutocompletePrompt.AutocompleteQuestionOptions<T>;

type Options = Record<string, any> & { nonInteractive?: boolean };

/**
 * prompt is used to prompt the user for values. Specifically, any `name` of a
 * provided question will be checked against the `options` object. If `name`
 * exists as a key in `options`, it will *not* be prompted for. If `options`
 * contains `nonInteractive = true`, then any `question.name` that does not
 * have a value in `options` will cause an error to be returned. Once the values
 * are queried, the values for them are put onto the `options` object, and the
 * answers are returned.
 * @param options The options object passed through by Command.
 * @param questions `Question`s to ask the user.
 * @return The answers, keyed by the `name` of the `Question`.
 */
export async function prompt(
  options: Options,
  // NB: If Observables are to be added here, the for loop below will need to
  // be adjusted as well.
  questions: ReadonlyArray<inquirer.DistinctQuestion>,
): Promise<any> {
  const prompts = [];
  // For each of our questions, if Options already has an answer,
  // we go ahead and _skip_ that question.
  for (const question of questions) {
    if (question.name && options[question.name] === undefined) {
      prompts.push(question);
    }
  }

  if (prompts.length && options.nonInteractive) {
    const missingOptions = Array.from(new Set(prompts.map((p) => p.name))).join(", ");
    throw new FirebaseError(
      `Missing required options (${missingOptions}) while running in non-interactive mode`,
      {
        children: prompts,
      },
    );
  }

  const answers = await inquirer.prompt(prompts);
  Object.keys(answers).forEach((k) => {
    options[k] = answers[k];
  });
  return answers;
}

export async function promptOnce<A extends inquirer.Answers>(
  question: QuestionsThatReturnAString<A>,
  options?: Options,
): Promise<string>;
export async function promptOnce<A extends inquirer.Answers>(
  question: inquirer.CheckboxQuestion<A>,
  options?: Options,
): Promise<string[]>;
export async function promptOnce<A extends inquirer.Answers>(
  question: inquirer.ConfirmQuestion<A>,
  options?: Options,
): Promise<boolean>;
export async function promptOnce<A extends inquirer.Answers>(
  question: inquirer.NumberQuestion<A>,
  options?: Options,
): Promise<number>;

// This one is a bit hard to type out. Choices can be many things, including a generator function. Even if we decided to limit
// the ListQuestion to have a choices of ReadonlyArray<ChoiceOption<A>>, a ChoiceOption<A> still has a `.value` of `any`
export async function promptOnce<A extends inquirer.Answers>(
  question: inquirer.ListQuestion<A>,
  options?: Options,
): Promise<any>;

/**
 * Quick and strongly-typed version of `prompt` to ask a single question.
 * @param question The question (of life, the universe, and everything).
 * @return The value as returned by `inquirer` for that quesiton.
 */
export async function promptOnce<A>(question: Question, options: Options = {}): Promise<A> {
  // Need to replace any .'s in the question name - otherwise, Inquirer puts the answer
  // in a nested object like so: `"a.b.c" => {a: {b: {c: "my-answer"}}}`
  question.name = question.name?.replace(/\./g, "/") || "question";
  await prompt(options, [question]);
  return options[question.name];
}

/**
 * Confirm if the user wants to continue
 */
export async function confirm(args: {
  nonInteractive?: boolean;
  force?: boolean;
  default?: boolean;
  message?: string;
}): Promise<boolean> {
  if (!args.nonInteractive && !args.force) {
    const message = args.message ?? `Do you wish to continue?`;
    return await promptOnce({
      type: "confirm",
      message,
      default: args.default,
    });
  } else if (args.nonInteractive && !args.force) {
    throw new FirebaseError("Pass the --force flag to use this command in non-interactive mode");
  } else {
    return true;
  }
}

/**
 * Prompts for a directory name, and reprompts if that path does not exist
 */
export async function promptForDirectory(args: {
  message: string;
  config: Config;
  default?: boolean;
  relativeTo?: string;
}): Promise<string> {
  let dir: string = "";
  while (!dir) {
    const target = args.config.path(
      await promptOnce({
        message: args.message,
      }),
    );
    if (fileExistsSync(target)) {
      logger.error(
        `Expected a directory, but ${target} is a file. Please provide a path to a directory.`,
      );
    } else if (!dirExistsSync(target)) {
      logger.error(`Directory ${target} not found. Please provide a path to a directory`);
    } else {
      dir = target;
    }
  }
  return dir;
}
