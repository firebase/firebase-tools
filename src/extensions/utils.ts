import { promptOnce } from "../prompt";
import { ParamOption } from "./modsApi";

// Modified version of the once function from prompt, to return as a joined string.
export async function onceWithJoin(question: any): Promise<string> {
  const response = await promptOnce(question);
  if (Array.isArray(response)) {
    return response.join(",");
  }
  return response;
}

interface ListItem {
  name: string;
  checked: boolean;
}

// Convert mod option to Inquirer-friendly list for the prompt, with all items unchecked.
export function convertModOptionToLabeledList(options: ParamOption[]): ListItem[] {
  return options.map(
    (option: ParamOption): ListItem => {
      return {
        checked: false,
        name: option.label || option.value,
      };
    }
  );
}

// Match a label to a ModOption.Value. When a SELECT or MULTISELECT mod is in the prompt and a user is asked to pick
// options, these options are displayed as ParamOption.label if present, otherwise as ParamOption.value.
export function modOptionToValue(label: string, options: ParamOption[]): string {
  for (const option of options) {
    if (label === option.label || label === option.value) {
      return option.value;
    }
  }
  return "";
}
