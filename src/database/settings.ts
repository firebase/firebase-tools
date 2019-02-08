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
      Control the maximum size of write for each request. It can be set to small, medium, large or unlimited.
      If set to unlimited, any arbitrary write will went through, and you are risking
      blocking database while this write is being processed. For example, deleting at the root
      of the database is unrevertible and the database will be unavailable until the delete finished.
      To avoid block large write, you can set this to small(target=10s), medium(target=30s), large(target=60s).
      The real time database will esitmate the size of each write and abort the request
      if it abort the write if the estimate is longer than the target time.
  `,
  parseInput: (input: string) => {
    switch (input) {
      case "small":
      case "medium":
      case "large":
      case "unlimited":
        return JSON.stringify(input);
      default:
        return undefined;
    }
  },
  parseInputErrorMessge:
    "defaultWriteSizeLimit must be either small, medium, large or unlimited. (tiny is not allowed)",
};

export const DATABASE_SETTINGS: Map<string, DatabaseSetting> = new Map();
DATABASE_SETTINGS.set(defaultWriteSizeLimit.path, defaultWriteSizeLimit);
