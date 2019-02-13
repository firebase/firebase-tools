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

export const DATABASE_SETTINGS: Map<string, DatabaseSetting> = new Map();
DATABASE_SETTINGS.set(defaultWriteSizeLimit.path, defaultWriteSizeLimit);

export const HELP_TEXT: string =
  "\nAvailable Settings:\n" +
  Array.from(DATABASE_SETTINGS.values())
    .map((setting: DatabaseSetting) => `  ${setting.path}:${setting.description}`)
    .join("");
export const INVALID_PATH_ERROR = `Path must be one of ${Array.from(DATABASE_SETTINGS.keys()).join(
  ", "
)}.`;
