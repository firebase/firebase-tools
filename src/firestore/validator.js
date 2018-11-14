const clc = require("cli-color");
const FirebaseError = require("../error");

/**
 * TODO: Docs
 */

const assertHas = function(obj, prop) {
  const objString = clc.cyan(JSON.stringify(obj));
  if (!obj[prop]) {
    throw new FirebaseError(`Must contain "${prop}": ${objString}`);
  }
};

const assertHasOneOf = function(obj, props) {
  const objString = clc.cyan(JSON.stringify(obj));
  let count = 0;
  props.forEach((prop) => {
    if (obj[prop]) {
      count++;
    }
  });

  if (count != 1) {
    throw new FirebaseError(`Must contain exactly one of "${props.join(",")}": ${objString}`);
  }
};

const assertEnum = function(obj, prop, valid) {
  const objString = clc.cyan(JSON.stringify(obj));
  if (valid.indexOf(obj[prop]) < 0) {
    throw new FirebaseError(`Field "${prop}" must be one of  ${valid.join(", ")}: ${objString}`);
  }
};

module.exports = {
  assertHas,
  assertHasOneOf,
  assertEnum,
};
