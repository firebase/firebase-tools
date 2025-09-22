import { validateRulesTool } from "../rules/validate_rules";
import { get_object_download_url } from "./get_download_url";

export const storageTools = [validateRulesTool("Storage"), get_object_download_url];
