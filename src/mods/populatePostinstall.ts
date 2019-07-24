import * as _ from "lodash";

/**
 * Substitutes environment variables into usage instructions,
 * and returns the substituted instructions.
 * @param params The params to substitute into instructions
 * @param instructions The pre- or post- install instructions from a mod
 * @returns Message to print out the the user
 */
export function populatePostinstall(
  instructions: string,
  params: { [key: string]: string }
): string {
  return _.reduce(
    params,
    (content, value, key) => {
      const regex = new RegExp("\\$\\{param:" + key + "\\}", "g");
      return _.replace(content, regex, value);
    },
    instructions
  );
}
