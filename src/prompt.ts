import * as inquirer from "inquirer";
import * as _ from "lodash";

import { FirebaseError } from "./error";

/**
 * Question type for inquirer. See
 * https://www.npmjs.com/package/inquirer#question
 */
export type Question = inquirer.Question;

/**
 * prompt is used to prompt the user for values. Specifically, any `name` of a
 * provided question will be checked against the `options` object. If `name`
 * exists as a key in `options`, it will *not* be prompted for. If `options`
 * contatins `nonInteractive = true`, then any `question.name` that does not
 * have a value in `options` will cause an error to be returned. Once the values
 * are queried, the values for them are put onto the `options` object, and the
 * answers are returned.
 * @param options The options object passed through by Command.
 * @param questions `Question`s to ask the user.
 * @return The answers, keyed by the `name` of the `Question`.
 */
export async function prompt(options: { [key: string]: any }, questions: Question[]): Promise<any> {
  const prompts = [];
  for (const question of questions) {
    if (question.name && options[question.name] === undefined) {
      prompts.push(question);
    }
  }

  if (prompts.length && options.nonInteractive) {
    const missingOptions = _.uniq(_.map(prompts, "name")).join(", ");
    throw new FirebaseError(
      `Missing required options (${missingOptions}) while running in non-interactive mode`,
      {
        children: prompts,
        exit: 1,
      }
    );
  }

  const answers = await inquirer.prompt(prompts);
  // lodash's forEach's call back is (value, key); this is not a typo.
  _.forEach(answers, (v, k) => {
    options[k] = v;
  });
  return answers;
}

/**
 * Quick version of `prompt` to ask a single question.
 * @param question The question (of life, the universe, and everything).
 * @return The value as returned by `inquirer` for that quesiton.
 */
export async function promptOnce(question: Question): Promise<any> {
  question.name = question.name || "question";
  const answers = await prompt({}, [question]);
  return answers[question.name];
}
