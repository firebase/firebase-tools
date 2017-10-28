'use strict';

var _ = require('lodash');
var is = require('is');
var request = require('request');

var LocalFunction = function(trigger, urls, controller) {
  this.name = trigger.name;
  this.eventTrigger = trigger.eventTrigger;
  this.httpsTrigger = trigger.httpsTrigger;
  this.controller = controller;
  if (this.httpsTrigger) {
    this.call = request.defaults({
      callback: this._requestCallBack,
      baseUrl: _.get(urls, this.name),
      uri: ''
    });
  } else {
    this.call = this._call.bind(this);
  }
};

LocalFunction.prototype._isDatabaseFunc = function(eventTrigger) {
  return /firebase.database/.test(eventTrigger.eventType);
};

LocalFunction.prototype._isFirestoreFunc = function(eventTrigger) {
  return /cloud.firestore/.test(eventTrigger.eventType);
};

LocalFunction.prototype._substituteParams = function(resource, params) {
  var wildcardRegex = new RegExp('{[^/{}]*}', 'g');
  return resource.replace(wildcardRegex, function(wildcard) {
    var wildcardNoBraces = wildcard.slice(1, -1); // .slice removes '{' and '}' from wildcard
    var sub = _.get(params, wildcardNoBraces);
    return sub || wildcardNoBraces + _.random(1, 9);
  });
};

LocalFunction.prototype._requestCallBack = function(err, response, body) {
  if (err) {
    return console.warn('\nERROR SENDING REQUEST: ' + err);
  }
  var status = response ? response.statusCode + ', ' : '';
  return console.log('\nRESPONSE RECEIVED FROM FUNCTION: ' + status + body);
};

LocalFunction.prototype.encodeFirestoreValue = function(data) {

  var isPlainObject= function(input) {
    return (
      typeof input === 'object' &&
      input !== null &&
      Object.getPrototypeOf(input) === Object.prototype
    );
  };

  var encodeHelper = function(val) {

    if (is.string(val)) {
      return {
        stringValue: val
      };
    }

    if (is.boolean(val)) {
      return {
        booleanValue: val
      };
    }

    if (is.integer(val)) {
      return {
        integerValue: val
      };
    }

    // Integers are handled above, the remaining numbers are treated as doubles
    if (is.number(val)) {
      return {
        doubleValue: val
      };
    }

    // if (is.date(val)) {
    //   let epochSeconds = Math.floor(val.getTime() / 1000);
    //   let timestamp = {
    //     seconds: epochSeconds,
    //     nanos: (val.getTime() - epochSeconds * 1000) * 1000000,
    //   };
    //   return {
    //     timestampValue: timestamp
    //   };
    // }

    // if (is.array(val)) {
    //   let encodedElements = [];
    //   for (let i = 0; i < val.length; ++i) {
    //     let enc = this.encodeValue(val[i]);
    //     if (enc) {
    //       encodedElements.push(enc);
    //     }
    //   }
    //   return {
    //     arrayValue: {
    //       values: encodedElements
    //     },
    //   };
    // }

    if (is.nil(val)) {
      return {
        nullValue: 'NULL_VALUE'
      };
    }

    // if (is.instance(val, DocumentReference) || is.instance(val, ResourcePath)) {
    //   return {
    //     referenceValue: val.formattedName,
    //   };
    // }

    // if (is.instance(val, GeoPoint)) {
    //   return {
    //     valueType: 'geoPointValue',
    //     geoPointValue: val.toProto(),
    //   };
    // }

    if (is.instanceof(val, Buffer) || is.instanceof(val, Uint8Array)) {
      return {
        bytesValue: val,
      };
    }

    // if (isPlainObject(val)) {
    //   console.log(val + 'is a plain object')
    //   return {
    //     mapValue: {
    //       fields: this.encodeFields(val)
    //     },
    //   };
    // }

    throw new Error(
      'Cannot encode ' + val + 'to a Firestore Value'
    );
  };

  return _.mapValues(data, encodeHelper);
};


// LocalFunction.prototype._convertToFirestoreWireFormat = function(fields) {
//   if (!fields) {
//     return {};
//   }
//   function convertHelper(data) {
//     let result;
//     _.forEach(data, (value, key) => {
//       let dataPart;
//       // var valueType = 
//       if (valueType === 'arrayValue') {
//         let array = _.get(value, 'values', []);
//         dataPart = {
//           arrayValue: {
//             values: _.map(array, (elem) => {
//               return convertHelper(elem);
//             }),
//           },
//         };
//       } else if (valueType === 'mapValue') {
//         let map = _.get(value, 'fields', {});
//         dataPart = {
//           mapValue: {
//             fields: _.mapValues(map, (val) => {
//               return convertHelper(val);
//             }),
//           },
//         };
//       } else if (valueType === 'timestampValue') {
//         dataPart = {timestampValue: dateToTimestampProto(value)};
//       } else {
//         dataPart = data;
//       }
//       result = _.merge({}, dataPart, {valueType: valueType});
//     });
//     return result;
//   }

//   return _.mapValues(fields, (data) => {
//     return convertHelper(data);
//   });
// };

LocalFunction.prototype._call = function(data, opts) {
  opts = opts || {};
  if (this.httpsTrigger) {
    this.controller.call(this.name, data || {});
  } else if (this.eventTrigger) {
    if (this._isDatabaseFunc(this.eventTrigger)) {
      var operationType = _.last(this.eventTrigger.eventType.split('.'));
      var dataPayload;
      if (operationType === 'create') {
        dataPayload = {
          data: null,
          delta: data
        };
      } else if (operationType === 'update' || operationType === 'write') {
        dataPayload = {
          data: data.before,
          delta: data.after
        };
      } else if (operationType === 'delete') {
        dataPayload = {
          data: data,
          delta: null
        };
      }
      opts.resource = this._substituteParams(this.eventTrigger.resource, opts.params);
      this.controller.call(this.name, dataPayload, opts);
    } else if (this._isFirestoreFunc(this.eventTrigger)){
      var dataPayload = {
        value: {
          "createTime": "2017-06-02T18:48:58.920638Z",
          fields: this.encodeFirestoreValue(data),
          "updateTime": "2017-06-16T04:50:48.293439Z"
        }
      }
      this.controller.call(this.name, dataPayload, opts);
    } else {
      this.controller.call(this.name, data || {}, opts);
    }
  }
  return 'Successfully invoked function.';
};

module.exports = LocalFunction;
