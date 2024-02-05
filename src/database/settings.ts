export interface DatabaseSetting {
  /**
   * The path of the flag to set.
   */
  path: string;

  /**
   * The description of the command.
   * It should include necessary paddings to be consistent (6 spaces per new line).
   */
  description: string;

  /**
   * Parse the user input to the value.
   * @return undefined if the input is invalid
   */
  parseInput: (input: string) => any | undefined;

  /**
   * The message to print out if the input is invalid.
   */
  parseInputErrorMessge: string;
}

const defaultWriteSizeLimit: DatabaseSetting = {
  path: "defaultWriteSizeLimit",
  description: `
      Set a limit for the size of each write request: small, medium, large or unlimited.
      If you choose 'unlimited', any and all write requests will be allowed, potentially
      blocking subsequent write requests while the database processes any large write
      requests. For example, deleting data at the database's root
      can't be reverted and the database will be unavailable until the delete is finished.
      To avoid blocking large write requests without running the risk of hanging your
      database, you can set this limit to small (target=10s), medium (target=30s), large (target=60s).
      Realtime Database estimates the size of each write request and aborts
      requests that will take longer than the target time.
  `,
  parseInput: (input: string) => {
    switch (input) {
      case "small":
      case "medium":
      case "large":
      case "unlimited":
        return input;
      default:
        return undefined;
    }
  },
  parseInputErrorMessge:
    "defaultWriteSizeLimit must be either small, medium, large or unlimited. (tiny is not allowed)",
};

const strictTriggerValidation: DatabaseSetting = {
  path: "strictTriggerValidation",
  description: `
      Strict validation is enabled by default for write operations that trigger
      events. Any write operations that trigger more than 1000 Cloud Functions or a
      single event greater than 1 MB in size will fail and return an error reporting
      the limit that was hit. This might mean that some Cloud Functions aren't
      triggered at all if they fail the pre-validation.

      If you're performing a larger write operation (for example, deleting your
      entire database), you might want to disable this validation, as the errors
      themselves might block the operation.
  `,
  parseInput: (input: string) => {
    switch (input) {
      case "true":
        return true;
      case "false":
        return false;
      default:
        return undefined;
    }
  },
  parseInputErrorMessge: "strictTriggerValidation must be 'true' or 'false'",
};

export const DATABASE_SETTINGS: Map<string, DatabaseSetting> = new Map();
DATABASE_SETTINGS.set(defaultWriteSizeLimit.path, defaultWriteSizeLimit);
DATABASE_SETTINGS.set(strictTriggerValidation.path, strictTriggerValidation);

export const HELP_TEXT: string =
  "\nAvailable Settings:\n" +
  Array.from(DATABASE_SETTINGS.values())
    .map((setting: DatabaseSetting) => `  ${setting.path}:${setting.description}`)
    .join("");
export const INVALID_PATH_ERROR = `Path must be one of ${Array.from(DATABASE_SETTINGS.keys()).join(
  ", ",
)}.`;
