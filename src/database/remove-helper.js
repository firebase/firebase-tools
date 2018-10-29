"use strict";

var api = require("../api");
var FirebaseError = require("../error");
var request = require("request");
var responseToError = require("../responseToError");
var utils = require("../utils");
const logger = require("../logger");

class DatabaseRemoveHelper {
  constructor(instance) {
    this.instance = instance;
  }
  deletePath(path) {
    return new Promise((resolve, reject) => {
      var url = utils.addSubdomain(api.realtimeOrigin, this.instance) + path + ".json?print=silent";
      var reqOptions = {
        url: url,
        json: true,
      };
      return api.addRequestHeaders(reqOptions).then(reqOptionsWithToken => {
        request.del(reqOptionsWithToken, (err, res, body) => {
          if (err) {
            return reject(
              new FirebaseError("Unexpected error while removing data at " + path, {
                exit: 2,
                original: err,
              })
            );
          } else if (res.statusCode >= 400) {
            return reject(responseToError(res, body));
          }
          logger.debug("[database] Sucessfully removed data at " + path);
          return resolve(true);
        });
      });
    });
  }

  prefetchTest(path) {
    var url = utils.addSubdomain(api.realtimeOrigin, this.instance) + path + ".json?timeout=100ms";
    var reqOptions = {
      url: url,
    };
    return api.addRequestHeaders(reqOptions).then(reqOptionsWithToken => {
      return new Promise((resolve, reject) => {
        logger.debug("[database] Prefetching test at " + path);
        request.get(reqOptionsWithToken, (err, res, body) => {
          if (err) {
            return reject(
              new FirebaseError("Unexpected error while prefetching data to delete" + path, {
                exit: 2,
              })
            );
          }
          switch (res.statusCode) {
            case 200:
              if (body) {
                return resolve("small");
              } else {
                return resolve("empty");
              }
            case 400:
              // timeout. large subtree, recursive delete for each subtree
              return resolve("large");
            case 413:
              // payload too large. large subtree, recursive delete for each subtree
              return resolve("large");
            default:
              return reject(responseToError(res, body));
          }
        });
      });
    });
  }

  listPath(path) {
    var url =
      utils.addSubdomain(api.realtimeOrigin, this.instance) +
      path +
      ".json?shallow=true&limitToFirst=10000";
    if (path === "/") {
      // there is a known bug with shallow and limitToFirst at "/"
      // TODO remove after the bug is fixed
      url = utils.addSubdomain(api.realtimeOrigin, this.instance) + path + ".json?shallow=true";
    }
    var reqOptions = {
      url: url,
    };
    return api.addRequestHeaders(reqOptions).then(reqOptionsWithToken => {
      return new Promise((resolve, reject) => {
        request.get(reqOptionsWithToken, (err, res, body) => {
          if (err) {
            return reject(
              new FirebaseError("Unexpected error while list subtrees", {
                exit: 2,
                original: err,
              })
            );
          } else if (res.statusCode >= 400) {
            return reject(responseToError(res, body));
          }
          var data = {};
          try {
            data = JSON.parse(body);
          } catch (e) {
            return reject(
              new FirebaseError("Malformed JSON response in shallow get ", {
                exit: 2,
                original: e,
              })
            );
          }
          if (data) {
            var keyList = Object.keys(data);
            return resolve(keyList);
          }
          return resolve([]);
        });
      });
    });
  }
}

module.exports = DatabaseRemoveHelper;
