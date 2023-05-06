import { sync as spawnSync } from "cross-spawn";
import { FirebaseError } from "../../error";

export function assertFlutterCliExists() {
  const process = spawnSync("flutter", ["--version"], { stdio: "ignore" });
  if (process.status) throw new FirebaseError("Flutter CLI not found.");
}
