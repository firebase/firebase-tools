import * as _ from "lodash";
import * as clc from "cli-color";

import * as getInstanceId from "./getInstanceId";
import * as getProjectId from "./getProjectId";
import { FirebaseError } from "./error";
import * as identifierToProjectId from "./identifierToProjectId";
import * as requireAuth from "./requireAuth";

export function requireAccess(options: any): Promise<any> {
  const projectId = getProjectId(options, false);
  options.project = projectId;

  if (process.env.FIREBASE_BYPASS_ADMIN_CALLS_FOR_TESTING === "true") {
    return requireAuth(options);
  }

  return requireAuth(options)
    .then(() => {
      return getInstanceId(options);
    })
    .then((instance) => {
      options.instance = instance;
      return;
    })
    .catch((err) => {
      if (err && err.exit && _.get(err, "context.body.error.code") !== "PROJECT_NOT_FOUND") {
        return Promise.reject(err);
      }

      return identifierToProjectId(projectId).then((realProjectId) => {
        if (realProjectId) {
          let fixCommand = "firebase use " + realProjectId;
          if (options.projectAlias) {
            fixCommand += " --alias " + options.projectAlias;
          }

          return Promise.reject(
            new FirebaseError(
              "Tried to access unrecognized project " +
                clc.bold(projectId) +
                ", but found matching instance for project " +
                clc.bold(realProjectId) +
                ".\n\n" +
                "To use " +
                clc.bold(realProjectId) +
                " instead, run:\n\n  " +
                clc.bold(fixCommand),
              { exit: 1 }
            )
          );
        }

        return Promise.reject(
          new FirebaseError("Unable to authorize access to project " + clc.bold(projectId), {
            exit: 1,
          })
        );
      });
    });
}
