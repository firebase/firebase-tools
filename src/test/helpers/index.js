"use strict";

var auth = require("../../auth");

exports.mockAuth = function(sandbox) {
  var authMock = sandbox.mock(auth);
  authMock
    .expects("getAccessToken")
    .atLeast(1)
    .resolves({ access_token: "an_access_token" });
};
