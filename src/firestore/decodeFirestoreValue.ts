import * as _ from "lodash";

function decode(val: { [fsType: string]: any }) {
  let firestoreType = _.keys(val)[0];
  let value = _.values(val)[0];

  switch (firestoreType) {
    case "integerValue":
      return _.toInteger(value);

    case "doubleValue":
      return _.toNumber(value);

    case "mapValue":
      return decodeFirestoreValue(value);

    case "arrayValue":
      return "values" in value ? value.values.map((v) => decode(v)) : [];

    // all remaining types: stringValue, booleanValue, referenceValue, geoPointValue, nullValue, timestampValue
    default:
      return _.values(val)[0];
  }
}

export function decodeFirestoreValue(data) {
  if (!"fields" in data) {
    return {};
  }

  let decoded = {};

  for (let key in data.fields) {
    decoded[key] = decode(data.fields[key]);
  }

  return decoded;
};
