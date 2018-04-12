"use strict";

var _ = require("lodash");
var chalk = require("chalk");
var Readable = require("stream").Readable;

var configstore = require("./configstore");
var FirebaseError = require("./error");
var logger = require("./logger");

var isWindows = process.platform === "win32";

var ENV_OVERRIDES = [];

module.exports = {
  /**
   * Create a Firebase Console URL for the specified path and project.
   * @param {String} project The Project ID for the URL.
   * @param {String} path The console path for the URL.
   */
  consoleUrl: function(project, path) {
    var api = require("./api");
    return api.consoleOrigin + "/project/" + project + path;
  },
  /**
   * Trace up the ancestry of objects that have a `parent` key, finding the
   * first instance of the provided key.
   *
   * @param {Object} options The options object with potential parents.
   * @param {String} key The key for which to look.
   */
  getInheritedOption: function(options, key) {
    var target = options;
    while (target) {
      if (_.has(target, key)) {
        return target[key];
      }
      target = target.parent;
    }
  },
  /**
   * Override a value with supplied environment variable if present.
   *
   * @param {String} envname The environment variable to override.
   * @param {String} value The default value if no env is set.
   * @param {Function} coerce A function that returns the environment
   *   variable in an acceptable format. If this throws an error, the
   *   default value will be used.
   * @returns {String} The fully resolved value
   */
  envOverride: function(envname, value, coerce) {
    if (process.env[envname] && process.env[envname].length) {
      ENV_OVERRIDES.push(envname);
      if (coerce) {
        try {
          return coerce(process.env[envname], value);
        } catch (e) {
          return value;
        }
      }
      return process.env[envname];
    }
    return value;
  },
  /**
   * A list of environment variable overrides that have been applied.
   */
  envOverrides: ENV_OVERRIDES,

  /**
   * Add a subdomain to the specified HTTP origin.
   * @param {String} origin The HTTP origin (e.g. https://example.com)
   * @param {String} subdomain The subdomain to add
   * @returns {String} The origin for the domain with a subdomain
   */
  addSubdomain: function(origin, subdomain) {
    return origin.replace("//", "//" + subdomain + ".");
  },
  /**
   * Log an info statement with a green checkmark at the start of the line.
   * @param {String} The message to log
   * @param {String} The log type, defaults to 'info'
   */
  logSuccess: function(message, type) {
    type = type || "info";
    var chr = isWindows ? "+" : "✔";
    logger[type](chalk.green(chr + " "), message);
  },
  /**
   * Log an info statement with a gray bullet at the start of the line.
   * @param {String} The message to log
   * @param {String} The log type, defaults to 'info'
   */
  logBullet: function(message, type) {
    type = type || "info";
    logger[type](chalk.cyan.bold("i "), message);
  },
  /**
   * Log an info statement with a gray bullet at the start of the line.
   * @param {String} The message to log
   * @param {String} The log type, defaults to 'info'
   */
  logWarning: function(message, type) {
    type = type || "warn";
    var chr = isWindows ? "!" : "⚠";
    logger[type](chalk.yellow.bold(chr + " "), message);
  },
  /**
   * Return a promise that rejects with a FirebaseError.
   * @param {String} message the error message
   * @param {Object} options the error options
   */
  reject: function(message, options) {
    return Promise.reject(new FirebaseError(message, options));
  },
  /**
   * Print out an explanatory message if a TTY is detected for how to manage STDIN
   */
  explainStdin: function() {
    if (isWindows) {
      throw new FirebaseError("STDIN input is not available on Windows.", {
        exit: 1,
      });
    }
    if (process.stdin.isTTY) {
      logger.info(chalk.bold("Note:"), "Reading STDIN. Type JSON data and then press Ctrl-D");
    }
  },
  /**
   * Convert text input to a Readable stream.
   * @param {String} text the text to convert
   * @returns {stream.Readable} the stream
   */
  stringToStream: function(text) {
    if (!text) {
      return undefined;
    }
    var s = new Readable();
    s.push(text);
    s.push(null);
    return s;
  },

  /**
   * Sets the active project alias or id in the specified directory.
   * @param {String} projectDir the project directory
   * @param {String} newActive the new active project alias or id
   */
  makeActiveProject: function(projectDir, newActive) {
    var activeProjects = configstore.get("activeProjects") || {};
    if (newActive) {
      activeProjects[projectDir] = newActive;
    } else {
      _.unset(activeProjects, projectDir);
    }

    configstore.set("activeProjects", activeProjects);
  },

  /**
   * Creates API endpoint string, e.g. /v1/projects/pid/cloudfunctions
   * @param {Array} array of parts to be connected together with slashes
   */
  endpoint: function(parts) {
    return "/" + _.join(parts, "/");
  },

  /**
   * Gets the event provider name for a Cloud Function from the trigger's eventType string.
   * @param {String} eventType string from an event trigger
   */
  getFunctionsEventProvider: function(eventType) {
    // Legacy event types:
    var parts = eventType.split("/");
    if (parts.length > 1) {
      var provider = _.last(parts[1].split("."));
      return _.capitalize(provider);
    }
    // New event types:
    if (eventType.match(/google.pubsub/)) {
      return "PubSub";
    } else if (eventType.match(/google.storage/)) {
      return "Storage";
    } else if (eventType.match(/google.analytics/)) {
      return "Analytics";
    } else if (eventType.match(/google.firebase.database/)) {
      return "Database";
    } else if (eventType.match(/google.firebase.auth/)) {
      return "Auth";
    } else if (eventType.match(/google.firebase.crashlytics/)) {
      return "Crashlytics";
    } else if (eventType.match(/google.firestore/)) {
      return "Firestore";
    }
    return _.capitalize(eventType.split(".")[1]);
  },

  promiseAllSettled: function(promises) {
    var wrappedPromises = _.map(promises, function(p) {
      return Promise.resolve(p)
        .then(function(val) {
          return { state: "fulfilled", value: val };
        })
        .catch(function(err) {
          return { state: "rejected", reason: err };
        });
    });
    return Promise.all(wrappedPromises);
  },
};
