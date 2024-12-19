import * as experiments from "../experiments.js";

/**
 * Loads all commands for our parser.
 */
export async function load(client: any): Promise<any> {
  const loadPromises: Promise<any>[] = [];
  const wrappedLoadCommand = (name: string) => {
    const p = loadCommand(name);
    loadPromises.push(p);
    return p;
  }
  async function loadCommand(name: string) {
    const t0 = process.hrtime.bigint();
    const { command: cmd } = await import(`./${name}.js`);
    console.log(cmd);
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
  client.appdistribution.distribute = wrappedLoadCommand("appdistribution-distribute");
  client.appdistribution.testers = {};
  client.appdistribution.testers.list = wrappedLoadCommand("appdistribution-testers-list");
  client.appdistribution.testers.add = wrappedLoadCommand("appdistribution-testers-add");
  client.appdistribution.testers.delete = wrappedLoadCommand("appdistribution-testers-remove");
  client.appdistribution.group = {};
  client.appdistribution.group.list = wrappedLoadCommand("appdistribution-groups-list");
  client.appdistribution.group.create = wrappedLoadCommand("appdistribution-groups-create");
  client.appdistribution.group.delete = wrappedLoadCommand("appdistribution-groups-delete");
  client.appdistribution.groups = client.appdistribution.group;
  client.apps = {};
  client.apps.create = wrappedLoadCommand("apps-create");
  client.apps.list = wrappedLoadCommand("apps-list");
  client.apps.sdkconfig = wrappedLoadCommand("apps-sdkconfig");
  client.apps.android = {};
  client.apps.android.sha = {};
  client.apps.android.sha.list = wrappedLoadCommand("apps-android-sha-list");
  client.apps.android.sha.create = wrappedLoadCommand("apps-android-sha-create");
  client.apps.android.sha.delete = wrappedLoadCommand("apps-android-sha-delete");
  client.auth = {};
  client.auth.export = wrappedLoadCommand("auth-export");
  client.auth.upload = wrappedLoadCommand("auth-import");
  client.crashlytics = {};
  client.crashlytics.symbols = {};
  client.crashlytics.symbols.upload = wrappedLoadCommand("crashlytics-symbols-upload");
  client.crashlytics.mappingfile = {};
  client.crashlytics.mappingfile.generateid = wrappedLoadCommand("crashlytics-mappingfile-generateid");
  client.crashlytics.mappingfile.upload = wrappedLoadCommand("crashlytics-mappingfile-upload");
  client.database = {};
  client.database.get = wrappedLoadCommand("database-get");
  client.database.import = wrappedLoadCommand("database-import");
  client.database.instances = {};
  client.database.instances.create = wrappedLoadCommand("database-instances-create");
  client.database.instances.list = wrappedLoadCommand("database-instances-list");
  client.database.profile = wrappedLoadCommand("database-profile");
  client.database.push = wrappedLoadCommand("database-push");
  client.database.remove = wrappedLoadCommand("database-remove");
  if (experiments.isEnabled("rtdbrules")) {
    client.database.rules = {};
    client.database.rules.get = wrappedLoadCommand("database-rules-get");
    client.database.rules.list = wrappedLoadCommand("database-rules-list");
    client.database.rules.stage = wrappedLoadCommand("database-rules-stage");
    client.database.rules.canary = wrappedLoadCommand("database-rules-canary");
    client.database.rules.release = wrappedLoadCommand("database-rules-release");
  }
  client.database.set = wrappedLoadCommand("database-set");
  client.database.settings = {};
  client.database.settings.get = wrappedLoadCommand("database-settings-get");
  client.database.settings.set = wrappedLoadCommand("database-settings-set");
  client.database.update = wrappedLoadCommand("database-update");
  client.deploy = wrappedLoadCommand("deploy");
  client.emulators = {};
  client.emulators.exec = wrappedLoadCommand("emulators-exec");
  client.emulators.export = wrappedLoadCommand("emulators-export");
  client.emulators.start = wrappedLoadCommand("emulators-start");
  client.experimental = {};
  client.experimental.functions = {};
  client.experimental.functions.shell = wrappedLoadCommand("experimental-functions-shell");
  client.experiments = {};
  client.experiments.list = wrappedLoadCommand("experiments-list");
  client.experiments.describe = wrappedLoadCommand("experiments-describe");
  client.experiments.enable = wrappedLoadCommand("experiments-enable");
  client.experiments.disable = wrappedLoadCommand("experiments-disable");
  client.ext = wrappedLoadCommand("ext");
  client.ext.configure = wrappedLoadCommand("ext-configure");
  client.ext.info = wrappedLoadCommand("ext-info");
  client.ext.export = wrappedLoadCommand("ext-export");
  client.ext.install = wrappedLoadCommand("ext-install");
  client.ext.list = wrappedLoadCommand("ext-list");
  client.ext.uninstall = wrappedLoadCommand("ext-uninstall");
  client.ext.update = wrappedLoadCommand("ext-update");
  client.ext.sdk = {};
  client.ext.sdk.install = wrappedLoadCommand("ext-sdk-install");
  client.ext.dev = {};
  client.ext.dev.init = wrappedLoadCommand("ext-dev-init");
  client.ext.dev.list = wrappedLoadCommand("ext-dev-list");
  client.ext.dev.register = wrappedLoadCommand("ext-dev-register");
  client.ext.dev.deprecate = wrappedLoadCommand("ext-dev-deprecate");
  client.ext.dev.undeprecate = wrappedLoadCommand("ext-dev-undeprecate");
  client.ext.dev.upload = wrappedLoadCommand("ext-dev-upload");
  client.ext.dev.usage = wrappedLoadCommand("ext-dev-usage");
  client.firestore = {};
  client.firestore.delete = wrappedLoadCommand("firestore-delete");
  client.firestore.indexes = wrappedLoadCommand("firestore-indexes-list");
  client.firestore.locations = wrappedLoadCommand("firestore-locations");
  client.firestore.databases = {};
  client.firestore.databases.list = wrappedLoadCommand("firestore-databases-list");
  client.firestore.databases.get = wrappedLoadCommand("firestore-databases-get");
  client.firestore.databases.create = wrappedLoadCommand("firestore-databases-create");
  client.firestore.databases.update = wrappedLoadCommand("firestore-databases-update");
  client.firestore.databases.delete = wrappedLoadCommand("firestore-databases-delete");
  client.firestore.databases.restore = wrappedLoadCommand("firestore-databases-restore");
  client.firestore.backups = {};
  client.firestore.backups.schedules = {};
  client.firestore.backups.list = wrappedLoadCommand("firestore-backups-list");
  client.firestore.backups.get = wrappedLoadCommand("firestore-backups-get");
  client.firestore.backups.delete = wrappedLoadCommand("firestore-backups-delete");
  client.firestore.backups.schedules.list = wrappedLoadCommand("firestore-backups-schedules-list");
  client.firestore.backups.schedules.create = wrappedLoadCommand("firestore-backups-schedules-create");
  client.firestore.backups.schedules.update = wrappedLoadCommand("firestore-backups-schedules-update");
  client.firestore.backups.schedules.delete = wrappedLoadCommand("firestore-backups-schedules-delete");
  client.functions = {};
  client.functions.config = {};
  client.functions.config.clone = wrappedLoadCommand("functions-config-clone");
  client.functions.config.export = wrappedLoadCommand("functions-config-export");
  client.functions.config.get = wrappedLoadCommand("functions-config-get");
  client.functions.config.set = wrappedLoadCommand("functions-config-set");
  client.functions.config.unset = wrappedLoadCommand("functions-config-unset");
  client.functions.delete = wrappedLoadCommand("functions-delete");
  client.functions.log = wrappedLoadCommand("functions-log");
  client.functions.shell = wrappedLoadCommand("functions-shell");
  client.functions.list = wrappedLoadCommand("functions-list");
  if (experiments.isEnabled("deletegcfartifacts")) {
    client.functions.deletegcfartifacts = wrappedLoadCommand("functions-deletegcfartifacts");
  }
  client.functions.secrets = {};
  client.functions.secrets.access = wrappedLoadCommand("functions-secrets-access");
  client.functions.secrets.destroy = wrappedLoadCommand("functions-secrets-destroy");
  client.functions.secrets.get = wrappedLoadCommand("functions-secrets-get");
  client.functions.secrets.describe = wrappedLoadCommand("functions-secrets-describe");
  client.functions.secrets.prune = wrappedLoadCommand("functions-secrets-prune");
  client.functions.secrets.set = wrappedLoadCommand("functions-secrets-set");
  client.help = wrappedLoadCommand("help");
  client.hosting = {};
  client.hosting.channel = {};
  client.hosting.channel.create = wrappedLoadCommand("hosting-channel-create");
  client.hosting.channel.delete = wrappedLoadCommand("hosting-channel-delete");
  client.hosting.channel.deploy = wrappedLoadCommand("hosting-channel-deploy");
  client.hosting.channel.list = wrappedLoadCommand("hosting-channel-list");
  client.hosting.channel.open = wrappedLoadCommand("hosting-channel-open");
  client.hosting.clone = wrappedLoadCommand("hosting-clone");
  client.hosting.disable = wrappedLoadCommand("hosting-disable");
  client.hosting.sites = {};
  client.hosting.sites.create = wrappedLoadCommand("hosting-sites-create");
  client.hosting.sites.delete = wrappedLoadCommand("hosting-sites-delete");
  client.hosting.sites.get = wrappedLoadCommand("hosting-sites-get");
  client.hosting.sites.list = wrappedLoadCommand("hosting-sites-list");
  client.init = wrappedLoadCommand("init");
  if (experiments.isEnabled("internaltesting")) {
    client.internaltesting = {};
    client.internaltesting.frameworks = {};
    client.internaltesting.frameworks.compose = wrappedLoadCommand("internaltesting-frameworks-compose");
    client.internaltesting.functions = {};
    client.internaltesting.functions.discover = wrappedLoadCommand("internaltesting-functions-discover");
  }
  if (experiments.isEnabled("apphosting")) {
    client.apphosting = {};
    client.apphosting.backends = {};
    client.apphosting.backends.list = wrappedLoadCommand("apphosting-backends-list");
    client.apphosting.backends.create = wrappedLoadCommand("apphosting-backends-create");
    client.apphosting.backends.get = wrappedLoadCommand("apphosting-backends-get");
    client.apphosting.backends.delete = wrappedLoadCommand("apphosting-backends-delete");
    client.apphosting.secrets = {};
    client.apphosting.secrets.set = wrappedLoadCommand("apphosting-secrets-set");
    client.apphosting.secrets.grantaccess = wrappedLoadCommand("apphosting-secrets-grantaccess");
    client.apphosting.secrets.describe = wrappedLoadCommand("apphosting-secrets-describe");
    client.apphosting.secrets.access = wrappedLoadCommand("apphosting-secrets-access");
    client.apphosting.rollouts = {};
    client.apphosting.rollouts.create = wrappedLoadCommand("apphosting-rollouts-create");
    client.apphosting.config = {};
    client.apphosting.config.export = wrappedLoadCommand("apphosting-config-export");
    if (experiments.isEnabled("internaltesting")) {
      client.apphosting.builds = {};
      client.apphosting.builds.get = wrappedLoadCommand("apphosting-builds-get");
      client.apphosting.builds.create = wrappedLoadCommand("apphosting-builds-create");
      client.apphosting.repos = {};
      client.apphosting.repos.create = wrappedLoadCommand("apphosting-repos-create");
      client.apphosting.rollouts.list = wrappedLoadCommand("apphosting-rollouts-list");
    }
  }
  client.login = wrappedLoadCommand("login");
  client.login.add = wrappedLoadCommand("login-add");
  client.login.ci = wrappedLoadCommand("login-ci");
  client.login.list = wrappedLoadCommand("login-list");
  client.login.use = wrappedLoadCommand("login-use");
  client.logout = wrappedLoadCommand("logout");
  client.open = wrappedLoadCommand("open");
  client.projects = {};
  client.projects.addfirebase = wrappedLoadCommand("projects-addfirebase");
  client.projects.create = wrappedLoadCommand("projects-create");
  client.projects.list = wrappedLoadCommand("projects-list");
  client.remoteconfig = {};
  client.remoteconfig.get = wrappedLoadCommand("remoteconfig-get");
  client.remoteconfig.rollback = wrappedLoadCommand("remoteconfig-rollback");
  client.remoteconfig.versions = {};
  client.remoteconfig.versions.list = wrappedLoadCommand("remoteconfig-versions-list");
  client.serve = wrappedLoadCommand("serve");
  client.setup = {};
  client.setup.emulators = {};
  client.setup.emulators.database = wrappedLoadCommand("setup-emulators-database");
  client.setup.emulators.firestore = wrappedLoadCommand("setup-emulators-firestore");
  client.setup.emulators.pubsub = wrappedLoadCommand("setup-emulators-pubsub");
  client.setup.emulators.storage = wrappedLoadCommand("setup-emulators-storage");
  client.setup.emulators.ui = wrappedLoadCommand("setup-emulators-ui");
  client.dataconnect = {};
  client.setup.emulators.dataconnect = wrappedLoadCommand("setup-emulators-dataconnect");
  client.dataconnect.services = {};
  client.dataconnect.services.list = wrappedLoadCommand("dataconnect-services-list");
  client.dataconnect.sql = {};
  client.dataconnect.sql.diff = wrappedLoadCommand("dataconnect-sql-diff");
  client.dataconnect.sql.migrate = wrappedLoadCommand("dataconnect-sql-migrate");
  client.dataconnect.sql.grant = wrappedLoadCommand("dataconnect-sql-grant");
  client.dataconnect.sql.shell = wrappedLoadCommand("dataconnect-sql-shell");
  client.dataconnect.sdk = {};
  client.dataconnect.sdk.generate = wrappedLoadCommand("dataconnect-sdk-generate");
  client.target = wrappedLoadCommand("target");
  client.target.apply = wrappedLoadCommand("target-apply");
  client.target.clear = wrappedLoadCommand("target-clear");
  client.target.remove = wrappedLoadCommand("target-remove");
  client.use = wrappedLoadCommand("use");

  await Promise.all(loadPromises);
  const t1 = process.hrtime.bigint();
  const diffMS = (t1 - t0) / BigInt(1e6);
  if (diffMS > 100) {
    // NOTE: logger.debug doesn't work since it's not loaded yet. Comment out below to debug.
    // console.error(`Loading all commands took ${diffMS}ms`);
  }
  return client;
}
