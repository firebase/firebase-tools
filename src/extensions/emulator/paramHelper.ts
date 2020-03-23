import * as _ from "lodash";
import * as path from "path";
import * as fs from "fs-extra";
import * as dotenv from "dotenv";

import { FirebaseError } from "../../error";

export function readParamsFile(envFilePath: string): any {
  try {
    const buf = fs.readFileSync(path.resolve(envFilePath), "utf8");
    return dotenv.parse(buf.toString().trim(), { debug: true });
  } catch (err) {
    throw new FirebaseError(`Error reading --test-params file: ${err.message}\n`, {
      original: err,
    });
  }
}

/**
 * This function substitutes params used in resource definitions with values.
 * (e.g If the original object contains `path/${FOO}` and the param FOO has the value of "bar",
 * then it will become `path/bar`)
 * @param original Object containing strings that have placeholders that look like`${}`
 * @param params params to substitute the placeholders for
 * @return Resources object with substituted params
 */
export function substituteParams(original: any, params: { [key: string]: string }): any {
  const startingString = JSON.stringify(original);
  const reduceFunction = (intermediateResult: string, paramVal: string, paramKey: string) => {
    const regex = new RegExp("\\$\\{" + paramKey + "\\}", "g");
    return intermediateResult.replace(regex, paramVal);
  };
  return JSON.parse(_.reduce(params, reduceFunction, startingString));
}
