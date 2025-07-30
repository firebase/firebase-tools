import type { Options } from "./options";

import { FirebaseError } from "./error";
import { isRunningInAIAgent } from "./utils";

export default function requireInteractive(options: Options & { _command?: any; _commanderCmd?: any }): Promise<void> {
  if (options.nonInteractive) {
    const command = options._command;
    const commanderCmd = options._commanderCmd;
    const commandName = command?.name;
    
    let errorMessage = "This command cannot run in non-interactive mode";
    
    if (isRunningInAIAgent()) {
      if (commandName) {
        errorMessage = `The '${commandName}' command requires user input that cannot be provided automatically.`;
        
        // Use Commander's helpInformation() if available
        if (commanderCmd && typeof commanderCmd.helpInformation === 'function') {
          try {
            const helpText = commanderCmd.helpInformation();
            errorMessage += `\n\n${helpText}`;
          } catch (e) {
            // Fallback if helpInformation() fails
            errorMessage += ` Please run this command directly in your terminal.`;
          }
        } else {
          errorMessage += ` Please run this command directly in your terminal.`;
        }
      } else {
        errorMessage = "This command requires user input that cannot be provided automatically. Please run this command directly in your terminal.";
      }
    } else if (commandName) {
      errorMessage = `The '${commandName}' command requires interactive mode to prompt for user input.\nTo see available options, run: firebase ${commandName} --help`;
    }
    
    return Promise.reject(
      new FirebaseError(errorMessage, {
        exit: 1,
      }),
    );
  }
  return Promise.resolve();
}
