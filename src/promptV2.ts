import * as inquirer from "@inquirer/prompts";
import { FirebaseError } from "./error";

// TOOD: Consider whether the magic of passing a name and an options object which may include
// options[name] and would otherwise store that value is too magical and instead shoudl be
// pushed on the call site.

export interface BasicOptions<T> {
  message: string;
  default?: T;
  force?: boolean;
  nonInteractive?: boolean;
}

export function guard<T>(
  opts: BasicOptions<T>,
): { shouldReturn: true; value: T } | { shouldReturn: false; value: undefined } {
  if (!opts.nonInteractive) {
    return { shouldReturn: false, value: undefined };
  }
  if (typeof opts.default !== "undefined") {
    return { shouldReturn: true, value: opts.default };
  }
  throw new FirebaseError(
    `Question "${opts.message}" does not have a default and cannot be answered in non-interactive mode`,
  );
}

/**
 * Options for the Input function.
 *
 * Exported because Inqurier does not export its own input configs anymore. Some
 * unused options are missing, such as theme.
 */
export type InputConfig = BasicOptions<string> & {
  transformer?: (
    value: string,
    {
      isFinal,
    }: {
      isFinal: boolean;
    },
  ) => string;
  validate?: (value: string) => boolean | string | Promise<string | boolean>;
};

/**
 * Prompt for a string input.
 */
export async function input(opts: InputConfig): Promise<string> {
  return inquirer.input(opts);
}

/**
 * Options for the confirm function.
 *
 * Epxorted because Inquirer does not export its own input configs anymore. Some unused
 * options are missing, such as theme.
 */
export type ConfirmConfig = BasicOptions<boolean> & {
  transformer?: (value: boolean) => string;
};

/**
 * Prompt a user to confirm a selection
 * Will abort if nonInteractive and not force
 */
export async function confirm(opts: ConfirmConfig): Promise<boolean> {
  if (opts.force) {
    // TODO: Should we print what we've forced?
    return true;
  }
  const { shouldReturn, value } = guard(opts);
  if (shouldReturn) {
    return value;
  }
  return inquirer.confirm(opts);
}

/**
 * A choice in a checkbox prompt.
 * Strongly typed to allow enum propagation
 */
export type Choice<Value> = {
  value: Value;
  name?: string;
  description?: string;
  short?: string;
  disabled?: boolean | string;
  checked?: boolean;
  type?: never;
};

// Personal hack deviating from inquirer to allow string values to propagate
// as strings or enum arrays without needing an explicit type at the call stie.
type MaybeLiteral<Value> = Value extends string ? Value : never;

/**
 * Options for the checkbox function.
 *
 * Epxorted because Inquirer does not export its own input configs anymore. Some unused
 * options are missing, such as theme. Some options are missing to promote consistency
 * within the CLI.
 */
export type CheckboxOptions<Value> = BasicOptions<Value[]> & {
  message: string;
  choices:
    | readonly (MaybeLiteral<Value> | inquirer.Separator)[]
    | readonly (inquirer.Separator | Choice<Value>)[];
  validate?:
    | ((choices: readonly Choice<Value>[]) => boolean | string | Promise<string | boolean>)
    | undefined;
};

/**
 * Prompt a user for one or more of many options.
 * Can accept a generic type for enum values.
 */
export async function checkbox<Value>(opts: CheckboxOptions<Value>): Promise<Value[]> {
  const { shouldReturn, value } = guard(opts);
  if (shouldReturn) {
    return value;
  }
  return inquirer.checkbox({
    ...opts,
    loop: true,
  });
}

/**
 * Options for the checkbox function.
 *
 * Epxorted because Inquirer does not export its own input configs anymore. Some unused
 * options are missing, such as theme. Some options are missing to promote consistency
 * within the CLI.
 * TODO: Had difficulty coalescing literals using Choice<Value>[]. Look into it.
 */
export type SelectOptions<Value> = BasicOptions<Value> & {
  choices:
    | readonly (MaybeLiteral<Value> | inquirer.Separator)[]
    | readonly (inquirer.Separator | Choice<Value>)[];
};

/**
 * Prompt a user to make a choice amongst a list.
 */
export async function select<Value>(opts: SelectOptions<Value>): Promise<Value> {
  const { shouldReturn, value } = guard(opts);
  if (shouldReturn) {
    return value;
  }
  return inquirer.select({
    ...opts,
    loop: false,
  });
}

/**
 * Options for the number function.
 *
 * Epxorted because Inquirer does not export its own input configs anymore. Some unused
 * options are missing, such as theme. Some options are missing to promote consistency
 * within the CLI.
 */
export type NumberOptions = BasicOptions<number> & {
  min?: number;
  max?: number;
  step?: number | "any";
  validate?: (value: number | undefined) => boolean | string | Promise<string | boolean>;
};

/**
 * Prompt a user for a number.
 */
export async function number(opts: NumberOptions): Promise<number> {
  const { shouldReturn, value } = guard(opts);
  if (shouldReturn) {
    return value;
  }
  return (await inquirer.number({ ...opts, required: true }))!;
}

/**
 * Options for the checkbox function.
 *
 * Epxorted because Inquirer does not export its own input configs anymore. Some unused
 * options are missing, such as theme. Some options are missing to promote consistency
 * within the CLI.
 */
type PasswordOptions = Omit<BasicOptions<string>, "default"> & {
  validate?: (value: string) => boolean | string | Promise<string | boolean>;
};

/**
 *
 */
export async function password(opts: PasswordOptions): Promise<string> {
  // Note, without default can basically only throw
  guard(opts);
  return inquirer.password({
    ...opts,
    mask: "",
  });
}
