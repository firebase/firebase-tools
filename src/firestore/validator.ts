import * as clc from "colorette";
import { FirebaseError } from "../error";

/**
 * Throw an error if 'obj' does not have a value for the property 'prop'.
 */
export function assertHas(obj: any, prop: string): void {
  const objString = clc.cyan(JSON.stringify(obj));
  if (!obj[prop]) {
    throw new FirebaseError(`Must contain "${prop}": ${objString}`);
  }
}

/**
 * throw an error if 'obj' does not have a value for exactly one of the
 * properties in 'props'.
 */
export function assertHasOneOf(obj: any, props: string[]): void {
  const objString = clc.cyan(JSON.stringify(obj));
  let count = 0;
  props.forEach((prop) => {
    if (obj[prop]) {
      count++;
    }
  });

  if (count !== 1) {
    throw new FirebaseError(`Must contain exactly one of "${props.join(",")}": ${objString}`);
  }
}

/**
 * Throw an error if the value of the property 'prop' on 'obj' is not one of
 * the values in the the array 'valid'.
 */
export function assertEnum(obj: any, prop: string, valid: any[]): void {
  const objString = clc.cyan(JSON.stringify(obj));
  if (valid.indexOf(obj[prop]) < 0) {
    throw new FirebaseError(`Field "${prop}" must be one of  ${valid.join(", ")}: ${objString}`);
  }
}

/**
 * Throw an error if the value of the property 'prop' differs against type
 * guard.
 */
export function assertType(prop: string, propValue: any, type: string): void {
  if (typeof propValue !== type) {
    throw new FirebaseError(`Property "${prop}" must be of type ${type}`);
  }
}
