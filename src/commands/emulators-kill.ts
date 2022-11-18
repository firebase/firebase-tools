import { Command } from "../command";
import * as commandUtils from "../emulator/commandUtils";
import { EmulatorRegistry } from "../emulator/registry";
import { exec } from "child_process";
import { emulators } from "../init/features";

export const command = new Command("emulators:kill")
  .before(commandUtils.beforeEmulatorCommand)
  .description("Force-kill the local Firebase emulators")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .action(async () => {
    await EmulatorRegistry.stopAll(/* forceShutdown=*/ true);
    exec("ps aux", (err, stdout) => {
      let lines = stdout.split("\n");
      const emulatorRegex =
        /pubsub-emulator|firestore-emulator|firebase-database-emulator|cloud-storage-rules-runtime|emulators\/ui-v\d/;
      lines = lines.filter((line) => emulatorRegex.exec(line));
      let tokens = [["sup"]]; // annoying declaration to appease lint
      for (let i = 0; i < lines.length; i++) {
        tokens[i] = lines[i].split(" ");
      }

      // This pulls out the 2nd column value which is PID:
      const pidListString = tokens.map((line) => line[1]).join(" ");
      exec("kill -9 " + pidListString);
      console.log(`Force quit ${tokens.length} processes.`);
    });
  });
