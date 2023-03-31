import * as experiments from "../experiments";

/**
 * Loads all commands for our parser.
 */
export function load(client: any): any {
  function loadCommand(name: string) {
    const t0 = process.hrtime.bigint();
    const { command: cmd } = require(`./${name}`);
    cmd.register(client);
    const t1 = process.hrtime.bigint();
    const diffMS = (t1 - t0) / BigInt(1e6);
    if (diffMS > 75) {
      // NOTE: logger.debug doesn't work since it's not loaded yet. Comment out below to debug.
      // console.error(`Loading ${name} took ${diffMS}ms`);
    }

    return cmd.runner();
  }

  const t0 = process.hrtime.bigint();

  client.appdistribution = {};
  client.appdistribution.distribute = loadCommand("appdistribution-distribute");
  client.appdistribution.testers = {};
  client.appdistribution.testers.add = loadCommand("appdistribution-testers-add");
  client.appdistribution.testers.delete = loadCommand("appdistribution-testers-remove");
  client.apps = {};
  client.apps.create = loadCommand("apps-create");
  client.apps.list = loadCommand("apps-list");
  client.apps.sdkconfig = loadCommand("apps-sdkconfig");
  client.apps.android = {};
  client.apps.android.sha = {};
  client.apps.android.sha.list = loadCommand("apps-android-sha-list");
  client.apps.android.sha.create = loadCommand("apps-android-sha-create");
  client.apps.android.sha.delete = loadCommand("apps-android-sha-delete");
  client.auth = {};
  client.auth.export = loadCommand("auth-export");
  client.auth.upload = loadCommand("auth-import");
  client.crashlytics = {};
  client.crashlytics.symbols = {};
  client.crashlytics.symbols.upload = loadCommand("crashlytics-symbols-upload");
  client.crashlytics.mappingfile = {};
  client.crashlytics.mappingfile.generateid = loadCommand("crashlytics-mappingfile-generateid");
  client.crashlytics.mappingfile.upload = loadCommand("crashlytics-mappingfile-upload");
  client.database = {};
  client.database.get = loadCommand("database-get");
  client.database.import = loadCommand("database-import");
  client.database.instances = {};
  client.database.instances.create = loadCommand("database-instances-create");
  client.database.instances.list = loadCommand("database-instances-list");
  client.database.profile = loadCommand("database-profile");
  client.database.push = loadCommand("database-push");
  client.database.remove = loadCommand("database-remove");
  if (experiments.isEnabled("rtdbrules")) {
    client.database.rules = {};
    client.database.rules.get = loadCommand("database-rules-get");
    client.database.rules.list = loadCommand("database-rules-list");
    client.database.rules.stage = loadCommand("database-rules-stage");
    client.database.rules.canary = loadCommand("database-rules-canary");
    client.database.rules.release = loadCommand("database-rules-release");
  }
  client.database.set = loadCommand("database-set");
  client.database.settings = {};
  client.database.settings.get = loadCommand("database-settings-get");
  client.database.settings.set = loadCommand("database-settings-set");
  client.database.update = loadCommand("database-update");
  client.deploy = loadCommand("deploy");
  client.emulators = {};
  client.emulators.exec = loadCommand("emulators-exec");
  client.emulators.export = loadCommand("emulators-export");
  client.emulators.start = loadCommand("emulators-start");
  client.experimental = {};
  client.experimental.functions = {};
  client.experimental.functions.shell = loadCommand("experimental-functions-shell");
  client.experiments = {};
  client.experiments.list = loadCommand("experiments-list");
  client.experiments.describe = loadCommand("experiments-describe");
  client.experiments.enable = loadCommand("experiments-enable");
  client.experiments.disable = loadCommand("experiments-disable");
  client.ext = loadCommand("ext");
  client.ext.configure = loadCommand("ext-configure");
  client.ext.info = loadCommand("ext-info");
  client.ext.export = loadCommand("ext-export");
  client.ext.install = loadCommand("ext-install");
  client.ext.list = loadCommand("ext-list");
  client.ext.uninstall = loadCommand("ext-uninstall");
  client.ext.update = loadCommand("ext-update");
  if (experiments.isEnabled("ext")) {
    client.ext.sources = {};
    client.ext.sources.create = loadCommand("ext-sources-create");
  }
  if (experiments.isEnabled("extdev")) {
    client.ext.dev = {};
    client.ext.dev.init = loadCommand("ext-dev-init");
    client.ext.dev.list = loadCommand("ext-dev-list");
    client.ext.dev.register = loadCommand("ext-dev-register");
    client.ext.dev.emulators = {};
    client.ext.dev.emulators.start = loadCommand("ext-dev-emulators-start");
    client.ext.dev.emulators.exec = loadCommand("ext-dev-emulators-exec");
    client.ext.dev.deprecate = loadCommand("ext-dev-deprecate");
    client.ext.dev.undeprecate = loadCommand("ext-dev-undeprecate");
    client.ext.dev.unpublish = loadCommand("ext-dev-unpublish");
    client.ext.dev.publish = loadCommand("ext-dev-publish");
    client.ext.dev.delete = loadCommand("ext-dev-extension-delete");
    client.ext.dev.usage = loadCommand("ext-dev-usage");
  }
  client.firestore = {};
  client.firestore.delete = loadCommand("firestore-delete");
  client.firestore.indexes = loadCommand("firestore-indexes-list");
  client.firestore.locations = loadCommand("firestore-locations");
  client.firestore.databases = {};
  client.firestore.databases.list = loadCommand("firestore-databases-list");
  client.firestore.databases.get = loadCommand("firestore-databases-get");
  client.firestore.databases.create = loadCommand("firestore-databases-create");
  client.firestore.databases.update = loadCommand("firestore-databases-update");
  client.firestore.databases.delete = loadCommand("firestore-databases-delete");
  client.functions = {};
  client.functions.config = {};
  client.functions.config.clone = loadCommand("functions-config-clone");
  client.functions.config.export = loadCommand("functions-config-export");
  client.functions.config.get = loadCommand("functions-config-get");
  client.functions.config.set = loadCommand("functions-config-set");
  client.functions.config.unset = loadCommand("functions-config-unset");
  client.functions.delete = loadCommand("functions-delete");
  client.functions.log = loadCommand("functions-log");
  client.functions.shell = loadCommand("functions-shell");
  client.functions.list = loadCommand("functions-list");
  if (experiments.isEnabled("deletegcfartifacts")) {
    client.functions.deletegcfartifacts = loadCommand("functions-deletegcfartifacts");
  }
  client.functions.secrets = {};
  client.functions.secrets.access = loadCommand("functions-secrets-access");
  client.functions.secrets.destroy = loadCommand("functions-secrets-destroy");
  client.functions.secrets.get = loadCommand("functions-secrets-get");
  client.functions.secrets.prune = loadCommand("functions-secrets-prune");
  client.functions.secrets.set = loadCommand("functions-secrets-set");
  client.help = loadCommand("help");
  client.hosting = {};
  client.hosting.channel = {};
  client.hosting.channel.create = loadCommand("hosting-channel-create");
  client.hosting.channel.delete = loadCommand("hosting-channel-delete");
  client.hosting.channel.deploy = loadCommand("hosting-channel-deploy");
  client.hosting.channel.list = loadCommand("hosting-channel-list");
  client.hosting.channel.open = loadCommand("hosting-channel-open");
  client.hosting.clone = loadCommand("hosting-clone");
  client.hosting.disable = loadCommand("hosting-disable");
  client.hosting.sites = {};
  client.hosting.sites.create = loadCommand("hosting-sites-create");
  client.hosting.sites.delete = loadCommand("hosting-sites-delete");
  client.hosting.sites.get = loadCommand("hosting-sites-get");
  client.hosting.sites.list = loadCommand("hosting-sites-list");
  client.init = loadCommand("init");
  if (experiments.isEnabled("internaltesting")) {
    client.internaltesting = {};
    client.internaltesting.functions = {};
    client.internaltesting.functions.discover = loadCommand("internaltesting-functions-discover");
  }
  client.login = loadCommand("login");
  client.login.add = loadCommand("login-add");
  client.login.ci = loadCommand("login-ci");
  client.login.list = loadCommand("login-list");
  client.login.use = loadCommand("login-use");
  client.logout = loadCommand("logout");
  client.open = loadCommand("open");
  client.projects = {};
  client.projects.addfirebase = loadCommand("projects-addfirebase");
  client.projects.create = loadCommand("projects-create");
  client.projects.list = loadCommand("projects-list");
  client.remoteconfig = {};
  client.remoteconfig.get = loadCommand("remoteconfig-get");
  client.remoteconfig.rollback = loadCommand("remoteconfig-rollback");
  client.remoteconfig.versions = {};
  client.remoteconfig.versions.list = loadCommand("remoteconfig-versions-list");
  client.serve = loadCommand("serve");
  client.setup = {};
  client.setup.emulators = {};
  client.setup.emulators.database = loadCommand("setup-emulators-database");
  client.setup.emulators.firestore = loadCommand("setup-emulators-firestore");
  client.setup.emulators.pubsub = loadCommand("setup-emulators-pubsub");
  client.setup.emulators.storage = loadCommand("setup-emulators-storage");
  client.setup.emulators.ui = loadCommand("setup-emulators-ui");
  client.target = loadCommand("target");
  client.target.apply = loadCommand("target-apply");
  client.target.clear = loadCommand("target-clear");
  client.target.remove = loadCommand("target-remove");
  client.use = loadCommand("use");

  const t1 = process.hrtime.bigint();
  const diffMS = (t1 - t0) / BigInt(1e6);
  if (diffMS > 100) {
    // NOTE: logger.debug doesn't work since it's not loaded yet. Comment out below to debug.
    // console.error(`Loading all commands took ${diffMS}ms`);
  }

  return client;
}
