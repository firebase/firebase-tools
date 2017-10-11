'use strict';

// Use the extended client
var client = require('./client').getInstance();

// Get the client's custom configstore if it's extended, of fallback to default one
module.exports = client.getConfigstore();
