"use strict";

var previews = require("../previews"); //eslint-disable-line

module.exports = function(client) {
  var loadCommand = function(name) {
    var cmd = require("./" + name);
    // .ts commands export at .default.
    if (cmd.default) {
      cmd = cmd.default;
    }
    cmd.register(client);
    return cmd.runner();
  };

  client.auth = {
    upload: loadCommand("auth-import"),
    export: loadCommand("auth-export"),
  };

  client.database = {
    get: loadCommand("database-get"),
    push: loadCommand("database-push"),
    set: loadCommand("database-set"),
    remove: loadCommand("database-remove"),
    update: loadCommand("database-update"),
    profile: loadCommand("database-profile"),
    settings: {
      get: loadCommand("database-settings-get"),
      set: loadCommand("database-settings-set"),
    },
  };

  client.firestore = {
    delete: loadCommand("firestore-delete"),
    indexes: loadCommand("firestore-indexes-list"),
  };

  client.deploy = loadCommand("deploy");

  client.hosting = {
    disable: loadCommand("hosting-disable"),
  };

  client.functions = {
    log: loadCommand("functions-log"),
    shell: loadCommand("functions-shell"),
    config: {
      clone: loadCommand("functions-config-clone"),
      get: loadCommand("functions-config-get"),
      set: loadCommand("functions-config-set"),
      unset: loadCommand("functions-config-unset"),
    },
    delete: loadCommand("functions-delete"),
  };

  client.experimental = {
    functions: {
      shell: loadCommand("experimental-functions-shell"),
    },
  };

  client.help = loadCommand("help");

  client.init = loadCommand("init");
  client.list = loadCommand("list");

  client.login = loadCommand("login");
  client.login.ci = loadCommand("login-ci");

  client.logout = loadCommand("logout");
  client.open = loadCommand("open");
  client.serve = loadCommand("serve");

  client.setup = {
    web: loadCommand("setup-web"),
    emulators: {
      database: loadCommand("setup-emulators-database"),
      firestore: loadCommand("setup-emulators-firestore"),
    },
  };

  client.target = loadCommand("target");
  client.target.apply = loadCommand("target-apply");
  client.target.clear = loadCommand("target-clear");
  client.target.remove = loadCommand("target-remove");

  client.tools = {
    migrate: loadCommand("tools-migrate"),
  };

  client.use = loadCommand("use");

  return client;
};
