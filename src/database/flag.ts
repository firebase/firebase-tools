export interface DatabaseFlag<T> {
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
  parseInput: (input: string) => T | undefined;
  /**
   *
   */
  parseInputErrorMessge: string;
}

const allowLongWritesFlag: DatabaseFlag<boolean> = {
  path: "allowLongWrites",
  description:
    "true to opt out of large write prevention, false to opt in. Large write may block your database from serving other traffics. By default, realtime database will abort write requests that are estimated to take more than 1 min. You should only opt out of large write prevention. if you existing application frequently trigger the threshold and you do not mind the database being unavailable during the large write.",
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
  parseInputErrorMessge: "allowLongWrites must be either true or false.",
};

export const DATABASE_FLAGS: Map<string, DatabaseFlag<any>> = new Map();
DATABASE_FLAGS.set(allowLongWritesFlag.path, allowLongWritesFlag);
DATABASE_FLAGS.set("path", allowLongWritesFlag);
