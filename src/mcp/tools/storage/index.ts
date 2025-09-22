import { getRulesTool } from "../rules/get_rules";
import { get_object_download_url } from "./get_download_url";

export const storageTools = [getRulesTool("Storage", "firebase.storage"), get_object_download_url];
