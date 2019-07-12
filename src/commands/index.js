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

  client.apps = {};
  client.apps.list = loadCommand("apps-list");
  client.apps.create = loadCommand("apps-create");
  client.auth = {};
  client.auth.export = loadCommand("auth-export");
  client.auth.upload = loadCommand("auth-import");
  client.database = {};
  client.database.get = loadCommand("database-get");
  client.database.instances = {};
  client.database.instances.create = loadCommand("database-instances-create");
  client.database.instances.list = loadCommand("database-instances-list");
  client.database.profile = loadCommand("database-profile");
  client.database.push = loadCommand("database-push");
  client.database.remove = loadCommand("database-remove");
  client.database.set = loadCommand("database-set");
  client.database.settings = {};
  client.database.settings.get = loadCommand("database-settings-get");
  client.database.settings.set = loadCommand("database-settings-set");
  client.database.update = loadCommand("database-update");
  client.deploy = loadCommand("deploy");
  client.emulators = {};
  client.emulators.exec = loadCommand("emulators-exec");
  client.emulators.start = loadCommand("emulators-start");
  client.experimental = {};
  client.experimental.functions = {};
  client.experimental.functions.shell = loadCommand("experimental-functions-shell");
  client.firestore = {};
  client.firestore.delete = loadCommand("firestore-delete");
  client.firestore.indexes = loadCommand("firestore-indexes-list");
  client.functions = {};
  client.functions.config = {};
  client.functions.config.clone = loadCommand("functions-config-clone");
  client.functions.config.get = loadCommand("functions-config-get");
  client.functions.config.set = loadCommand("functions-config-set");
  client.functions.config.unset = loadCommand("functions-config-unset");
  client.functions.delete = loadCommand("functions-delete");
  client.functions.log = loadCommand("functions-log");
  client.functions.shell = loadCommand("functions-shell");
  client.help = loadCommand("help");
  client.hosting = {};
  client.hosting.disable = loadCommand("hosting-disable");
  client.init = loadCommand("init");
  client.list = loadCommand("list");
  client.login = loadCommand("login");
  client.login.ci = loadCommand("login-ci");
  client.logout = loadCommand("logout");
  client.open = loadCommand("open");
  client.projects = {};
  client.projects.list = loadCommand("projects-list");
  client.projects.create = loadCommand("projects-create");
  client.serve = loadCommand("serve");
  client.setup = {};
  client.setup.emulators = {};
  client.setup.emulators.database = loadCommand("setup-emulators-database");
  client.setup.emulators.firestore = loadCommand("setup-emulators-firestore");
  client.setup.web = loadCommand("setup-web");
  client.target = loadCommand("target");
  client.target.apply = loadCommand("target-apply");
  client.target.clear = loadCommand("target-clear");
  client.target.remove = loadCommand("target-remove");
  client.tools = {};
  client.tools.migrate = loadCommand("tools-migrate");
  client.use = loadCommand("use");

  return client;
};
