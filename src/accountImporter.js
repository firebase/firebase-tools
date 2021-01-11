"use strict";

var clc = require("cli-color");
var _ = require("lodash");

var api = require("./api");
var logger = require("./logger");
var utils = require("./utils");
var { FirebaseError } = require("./error");

var ALLOWED_JSON_KEYS = [
  "localId",
  "email",
  "emailVerified",
  "passwordHash",
  "salt",
  "displayName",
  "photoUrl",
  "createdAt",
  "lastSignedInAt",
  "providerUserInfo",
  "phoneNumber",
  "disabled",
  "customAttributes",
];
var ALLOWED_JSON_KEYS_RENAMING = {
  lastSignedInAt: "lastLoginAt",
};
var ALLOWED_PROVIDER_USER_INFO_KEYS = ["providerId", "rawId", "email", "displayName", "photoUrl"];
var ALLOWED_PROVIDER_IDS = ["google.com", "facebook.com", "twitter.com", "github.com"];

var _isValidBase64 = function (str) {
  var expected = Buffer.from(str, "base64").toString("base64");
  // Buffer automatically pads with '=' character,
  // but input string might not have padding.
  if (str.length < expected.length && str.slice(-1) !== "=") {
    str += "=".repeat(expected.length - str.length);
  }
  return expected === str;
};

var _toWebSafeBase64 = function (data) {
  return data.toString("base64").replace(/\//g, "_").replace(/\+/g, "-");
};

var _addProviderUserInfo = function (user, providerId, arr) {
  if (arr[0]) {
    user.providerUserInfo.push({
      providerId: providerId,
      rawId: arr[0],
      email: arr[1],
      displayName: arr[2],
      photoUrl: arr[3],
    });
  }
};

var _genUploadAccountPostBody = function (projectId, accounts, hashOptions) {
  var postBody = {
    users: accounts.map(function (account) {
      if (account.passwordHash) {
        account.passwordHash = _toWebSafeBase64(account.passwordHash);
      }
      if (account.salt) {
        account.salt = _toWebSafeBase64(account.salt);
      }
      _.each(ALLOWED_JSON_KEYS_RENAMING, function (value, key) {
        if (account[key]) {
          account[value] = account[key];
          delete account[key];
        }
      });
      return account;
    }),
  };
  if (hashOptions.hashAlgo) {
    postBody.hashAlgorithm = hashOptions.hashAlgo;
  }
  if (hashOptions.hashKey) {
    postBody.signerKey = _toWebSafeBase64(hashOptions.hashKey);
  }
  if (hashOptions.saltSeparator) {
    postBody.saltSeparator = _toWebSafeBase64(hashOptions.saltSeparator);
  }
  if (hashOptions.rounds) {
    postBody.rounds = hashOptions.rounds;
  }
  if (hashOptions.memCost) {
    postBody.memoryCost = hashOptions.memCost;
  }
  if (hashOptions.cpuMemCost) {
    postBody.cpuMemCost = hashOptions.cpuMemCost;
  }
  if (hashOptions.parallelization) {
    postBody.parallelization = hashOptions.parallelization;
  }
  if (hashOptions.blockSize) {
    postBody.blockSize = hashOptions.blockSize;
  }
  if (hashOptions.dkLen) {
    postBody.dkLen = hashOptions.dkLen;
  }
  if (hashOptions.passwordHashOrder) {
    postBody.passwordHashOrder = hashOptions.passwordHashOrder;
  }
  postBody.targetProjectId = projectId;
  return postBody;
};

var transArrayToUser = function (arr) {
  var user = {
    localId: arr[0],
    email: arr[1],
    emailVerified: arr[2] === "true",
    passwordHash: arr[3],
    salt: arr[4],
    displayName: arr[5],
    photoUrl: arr[6],
    createdAt: arr[23],
    lastLoginAt: arr[24],
    phoneNumber: arr[25],
    providerUserInfo: [],
    disabled: arr[26],
    customAttributes: arr[27],
  };
  _addProviderUserInfo(user, "google.com", arr.slice(7, 11));
  _addProviderUserInfo(user, "facebook.com", arr.slice(11, 15));
  _addProviderUserInfo(user, "twitter.com", arr.slice(15, 19));
  _addProviderUserInfo(user, "github.com", arr.slice(19, 23));

  if (user.passwordHash && !_isValidBase64(user.passwordHash)) {
    return {
      error: "Password hash should be base64 encoded.",
    };
  }
  if (user.salt && !_isValidBase64(user.salt)) {
    return {
      error: "Password salt should be base64 encoded.",
    };
  }
  return user;
};

var validateOptions = function (options) {
  var hashOptions = _validateRequiredParameters(options);
  if (!hashOptions.valid) {
    return hashOptions;
  }
  var hashInputOrder = options.hashInputOrder ? options.hashInputOrder.toUpperCase() : undefined;
  if (hashInputOrder) {
    if (hashInputOrder != "SALT_FIRST" && hashInputOrder != "PASSWORD_FIRST") {
      throw new FirebaseError("Unknown password hash order flag", { exit: 1 });
    } else {
      hashOptions["passwordHashOrder"] =
        hashInputOrder == "SALT_FIRST" ? "SALT_AND_PASSWORD" : "PASSWORD_AND_SALT";
    }
  }
  return hashOptions;
};

var _validateRequiredParameters = function (options) {
  if (!options.hashAlgo) {
    utils.logWarning("No hash algorithm specified. Password users cannot be imported.");
    return { valid: true };
  }
  var hashAlgo = options.hashAlgo.toUpperCase();
  let roundsNum;
  switch (hashAlgo) {
    case "HMAC_SHA512":
    case "HMAC_SHA256":
    case "HMAC_SHA1":
    case "HMAC_MD5":
      if (!options.hashKey || options.hashKey === "") {
        throw new FirebaseError(
          "Must provide hash key(base64 encoded) for hash algorithm " + options.hashAlgo,
          { exit: 1 }
        );
      }
      return { hashAlgo: hashAlgo, hashKey: options.hashKey, valid: true };
    case "MD5":
    case "SHA1":
    case "SHA256":
    case "SHA512":
      // MD5 is [0,8192] but SHA1, SHA256, and SHA512 are [1,8192]
      roundsNum = parseInt(options.rounds, 10);
      var minRounds = hashAlgo === "MD5" ? 0 : 1;
      if (isNaN(roundsNum) || roundsNum < minRounds || roundsNum > 8192) {
        throw new FirebaseError(
          `Must provide valid rounds(${minRounds}..8192) for hash algorithm ${options.hashAlgo}`,
          { exit: 1 }
        );
      }
      return { hashAlgo: hashAlgo, rounds: options.rounds, valid: true };
    case "PBKDF_SHA1":
    case "PBKDF2_SHA256":
      roundsNum = parseInt(options.rounds, 10);
      if (isNaN(roundsNum) || roundsNum < 0 || roundsNum > 120000) {
        throw new FirebaseError(
          "Must provide valid rounds(0..120000) for hash algorithm " + options.hashAlgo,
          { exit: 1 }
        );
      }
      return { hashAlgo: hashAlgo, rounds: options.rounds, valid: true };
    case "SCRYPT":
      if (!options.hashKey || options.hashKey === "") {
        throw new FirebaseError(
          "Must provide hash key(base64 encoded) for hash algorithm " + options.hashAlgo,
          { exit: 1 }
        );
      }
      roundsNum = parseInt(options.rounds, 10);
      if (isNaN(roundsNum) || roundsNum <= 0 || roundsNum > 8) {
        throw new FirebaseError(
          "Must provide valid rounds(1..8) for hash algorithm " + options.hashAlgo,
          { exit: 1 }
        );
      }
      var memCost = parseInt(options.memCost, 10);
      if (isNaN(memCost) || memCost <= 0 || memCost > 14) {
        throw new FirebaseError(
          "Must provide valid memory cost(1..14) for hash algorithm " + options.hashAlgo,
          { exit: 1 }
        );
      }
      var saltSeparator = "";
      if (options.saltSeparator) {
        saltSeparator = options.saltSeparator;
      }
      return {
        hashAlgo: hashAlgo,
        hashKey: options.hashKey,
        saltSeparator: saltSeparator,
        rounds: options.rounds,
        memCost: options.memCost,
        valid: true,
      };
    case "BCRYPT":
      return { hashAlgo: hashAlgo, valid: true };
    case "STANDARD_SCRYPT":
      var cpuMemCost = parseInt(options.memCost, 10);
      var parallelization = parseInt(options.parallelization, 10);
      var blockSize = parseInt(options.blockSize, 10);
      var dkLen = parseInt(options.dkLen, 10);
      return {
        hashAlgo: hashAlgo,
        valid: true,
        cpuMemCost: cpuMemCost,
        parallelization: parallelization,
        blockSize: blockSize,
        dkLen: dkLen,
      };
    default:
      throw new FirebaseError("Unsupported hash algorithm " + clc.bold(options.hashAlgo));
  }
};

var _validateProviderUserInfo = function (providerUserInfo) {
  if (!_.includes(ALLOWED_PROVIDER_IDS, providerUserInfo.providerId)) {
    return {
      error: JSON.stringify(providerUserInfo, null, 2) + " has unsupported providerId",
    };
  }
  var keydiff = _.difference(_.keys(providerUserInfo), ALLOWED_PROVIDER_USER_INFO_KEYS);
  if (keydiff.length) {
    return {
      error:
        JSON.stringify(providerUserInfo, null, 2) + " has unsupported keys: " + keydiff.join(","),
    };
  }
  return {};
};

var validateUserJson = function (userJson) {
  var keydiff = _.difference(_.keys(userJson), ALLOWED_JSON_KEYS);
  if (keydiff.length) {
    return {
      error: JSON.stringify(userJson, null, 2) + " has unsupported keys: " + keydiff.join(","),
    };
  }
  if (userJson.providerUserInfo) {
    for (var i = 0; i < userJson.providerUserInfo.length; i++) {
      var res = _validateProviderUserInfo(userJson.providerUserInfo[i]);
      if (res.error) {
        return res;
      }
    }
  }
  var badFormat = JSON.stringify(userJson, null, 2) + " has invalid data format: ";
  if (userJson.passwordHash && !_isValidBase64(userJson.passwordHash)) {
    return {
      error: badFormat + "Password hash should be base64 encoded.",
    };
  }
  if (userJson.salt && !_isValidBase64(userJson.salt)) {
    return {
      error: badFormat + "Password salt should be base64 encoded.",
    };
  }
  return {};
};

var _sendRequest = function (projectId, userList, hashOptions) {
  logger.info("Starting importing " + userList.length + " account(s).");
  return api
    .request("POST", "/identitytoolkit/v3/relyingparty/uploadAccount", {
      auth: true,
      json: true,
      data: _genUploadAccountPostBody(projectId, userList, hashOptions),
      origin: api.googleOrigin,
    })
    .then(function (ret) {
      if (ret.body.error) {
        logger.info("Encountered problems while importing accounts. Details:");
        logger.info(
          ret.body.error.map(function (rawInfo) {
            return {
              account: JSON.stringify(userList[parseInt(rawInfo.index, 10)], null, 2),
              reason: rawInfo.message,
            };
          })
        );
      } else {
        utils.logSuccess("Imported successfully.");
      }
      logger.info();
    });
};

var serialImportUsers = function (projectId, hashOptions, userListArr, index) {
  return _sendRequest(projectId, userListArr[index], hashOptions).then(function () {
    if (index < userListArr.length - 1) {
      return serialImportUsers(projectId, hashOptions, userListArr, index + 1);
    }
  });
};

var accountImporter = {
  validateOptions: validateOptions,
  validateUserJson: validateUserJson,
  transArrayToUser: transArrayToUser,
  serialImportUsers: serialImportUsers,
};

module.exports = accountImporter;
