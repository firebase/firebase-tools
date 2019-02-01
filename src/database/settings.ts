export interface DatabaseSetting {
  /**
   * The path of the flag to set.
   */
  path: string;
  /**
   *
   */
  description: string;
  /**
   * The user input to the value.
   */
  parseInput: (input: string) => any | undefined;
  /**
   *
   */
  parseInputErrorMessge: string;
}

const defaultWriteSizeLimit: DatabaseSetting = {
  path: "defaultWriteSizeLimit",
  description:
    "true to opt out of large write prevention, false to opt in. Large write may block your database from serving other traffics. By default, realtime database will abort write requests that are estimated to take more than 1 min. You should only opt out of large write prevention. if you existing application frequently trigger the threshold and you do not mind the database being unavailable during the large write.",
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
  parseInputErrorMessge: "defaultWriteSizeLimit must be either small, medium, large or unlimited. (tiny is not allowed)",
};

export const DATABASE_SETTINGS: Map<string, DatabaseSetting> = new Map();
DATABASE_SETTINGS.set(defaultWriteSizeLimit.path, defaultWriteSizeLimit);
DATABASE_SETTINGS.set("path", defaultWriteSizeLimit);
