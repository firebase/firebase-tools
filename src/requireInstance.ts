import * as clc from "cli-color";
import getInstanceId from "./getInstanceId";
import * as utils from "./utils";

export default async function(options: any) {
  if (options.instance) {
    return Promise.resolve();
  }
  try {
    const instance = await getInstanceId(options);
    if (instance === "") {
      return utils.reject(
        `It looks like you haven't created a Realtime Database instance in this project before. Go to ${clc.bold.underline(
          `https://console.firebase.google.com/project/${options.project}/database`
        )} to create your default Realtime Database instance.`,
        { exit: 1 }
      );
    }
    options.instance = instance;
    return Promise.resolve();
  } catch (err) {
    return utils.reject(
      `Failed to get details for project: ${options.project}. Please look at firebase-debug.log for more details`,
      {
        exit: 1,
        original: err,
      }
    );
  }
}
