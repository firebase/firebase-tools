import { FirebaseError } from "../../error";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import * as planner from "./planner";

export async function prepare(
  context: any, // TODO: type this
  options: Options,
  payload: any // TODO: type this
){
/**
 * Outline:
 * get 'want' from firebase.json
 * check for .env files in extensions/
 * 
 * get 'have' by calling listExtensionInstances
 * 
 * use list comprehensions to get toCreate, toUpdate, toDelete
 * print out summary of changes that will be made
 * prompt whether to delete extensions or not
 * 
 */
  console.log('hi');
  const projectId = needProjectId(options);
  const have = await planner.have(projectId)
  console.log("have", have)
  const want = await planner.want(options.config.get("extensions"), options.config.projectDir);
  console.log("want", want)
}