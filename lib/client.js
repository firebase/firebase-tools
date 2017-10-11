'use strict';

var path = require('path');
var findRoot = require('find-root');
var crypto = require('crypto');
var Configstore = require('configstore');
var pkg = require('../package.json');

// Init a Configstore instance with an unique ID eg. package name
// and optionally some default values
var defaultConfigstore = new Configstore(pkg.name);

var Client = (function() {
  var _client;

  function init() {
    return {
      getConfigstore: function() {
        return _client !== undefined && _client.isExtended() ? _client.getExtension().configstore : defaultConfigstore;
      },
      isExtended: function() {
        return _client !== undefined && _client._extension !== undefined;
      },
      getExtension: function() {
        return _client._extension;
      },
      extend: function(options) {
        _client._extension = {
          // Start with the default root, based on the current working directory
          root: path.resolve(process.cwd()),

          // Keep track of extension options, if any
          options: Object.assign({}, { name: 'Firebase CLI', version: pkg.version }, options)
        };

        try {
          // If this is a Node project, let's save the project root
          _client._extension.root = findRoot(_client._extension._root);

          // Let's also take a look at the package, if we have one
          _client._extension.package = require(_client._extension.root + '/package.json');
        } catch (e) {
          // We're not part of a Node project so stick with the default
        }

        // Create a unique identifier for this client, based on its unique root
        _client._extension.id = crypto.createHash('md5').update('hash://' + _client._extension.root).digest('hex');

        // Let's give this client its own config store, based on its unique hash
        _client._extension.configstore = new Configstore(_client._extension.id);

        // Transform the client and
        return _client;
      }
    };
  }

  return {
    getInstance: function() {
      if (!_client) {
        _client = init();
      }

      return _client;
    }
  };
})();

module.exports = Client;
