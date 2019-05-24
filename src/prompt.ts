import * as inquirer from "inquirer";
import * as _ from "lodash";
import * as FirebaseError from "./error";

export async function prompt(options: any, questions: any[]): Promise<any> {
  const prompts = [];
  for (const question of questions) {
    if (!options[question.name]) {
      prompts.push(question);
    }
  }

  if (prompts.length && options.nonInteractive) {
    throw new FirebaseError(
      "Missing required options (" +
        _.uniq(_.map(prompts, "name")).join(", ") +
        ") while running in non-interactive mode",
      {
        children: prompts,
        exit: 1,
      }
    );
  }

  const answers = await inquirer.prompt(prompts);
  _.forEach(answers, (v, k) => {
    options[k] = v;
  });
  return answers;
}

/**
 * Allow a one-off prompt when we don't need to ask a bunch of questions.
 */
export async function promptOnce(question: any): Promise<any> {
  question.name = question.name || "question";
  const answers = await prompt({}, [question]);
  return answers[question.name];
}

export function convertLabeledListChoices(choices: any): { checked: any; name: string } {
  return choices.map((choice: any) => {
    return { checked: choice.checked, name: choice.label };
  });
}

export function listLabelToValue(label: any, choices: any[]): any {
  for (const choice of choices) {
    if (choice.label === label) {
      return choice.name;
    }
  }
  return "";
}
