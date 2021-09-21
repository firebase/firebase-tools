import { Options } from "../../options";

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
}