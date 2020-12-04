import { RemoteConfigTemplate } from "./interfaces";

// Creates a maximum limit of 50 names for each entry
const MAX_DISPLAY_ITEMS = 50;

/**
 * Function retrieves names for parameters and parameter groups
 * @param templateItems Input is template.parameters or template.parameterGroups
 * @return {string} Parses the template and returns a formatted string that concatenates items and limits the number of items outputted that is used in the table
 */
export function parseTemplateForTable(
  templateItems: RemoteConfigTemplate["parameters"] | RemoteConfigTemplate["parameterGroups"]
): string {
  let outputStr = "";
  let counter = 0;
  for (const item in templateItems) {
    if (Object.prototype.hasOwnProperty.call(templateItems, item)) {
      outputStr = outputStr.concat(item, "\n");
      counter++;
      if (counter === MAX_DISPLAY_ITEMS) {
        outputStr += "+more..." + "\n";
        break;
      }
    }
  }
  return outputStr;
}
