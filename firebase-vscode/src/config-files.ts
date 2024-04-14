import * as path from "path";
import * as vscode from "vscode";
import { currentOptions } from "./options";
import { RC } from "../../src/rc";
import { firebaseRC } from "./core/config";

/**
 * Write new default project to .firebaserc
 */
export async function updateFirebaseRCProject(
  alias: string,
  projectId: string,
) {
  const rc =
    firebaseRC.value ??
    // We don't update firebaseRC if we create a temporary RC,
    // as the file watcher will update the value for us.
    // This is only for the sake of calling `save()`.
    new RC(path.join(currentOptions.value.cwd, ".firebaserc"), {});

  if (rc.resolveAlias(alias) === projectId) {
    // Nothing to update, avoid an unnecessary write.
    // That's especially important as a write will trigger file watchers,
    // which may then re-trigger this function.
    return;
  }

  rc.addProjectAlias(alias, projectId);
  rc.save();
}
