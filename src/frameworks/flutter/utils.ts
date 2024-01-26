import { sync as spawnSync } from "cross-spawn";
import { FirebaseError } from "../../error";

export function assertFlutterCliExists() {
  const process = spawnSync("flutter", ["--version"], { stdio: "ignore" });
  if (process.status !== 0)
    throw new FirebaseError(
      "Flutter CLI not found, follow the instructions here https://docs.flutter.dev/get-started/install before trying again.",
    );
}
