'use strict';

var _ = require('lodash');
var api = require('./api');
var chalk = require('chalk');
var ensureApiEnabled = require('./ensureApiEnabled');
var getProjectId = require('./getProjectId');
var FirebaseError = require('./error');
var logger = require('./logger');
var RSVP = require('rsvp');
var utils = require('./utils');
var gcp = require('./gcp');

exports.RESERVED_NAMESPACES = ['firebase'];

function ensureConfig(projectId) {
  return api.request('POST', '/v1beta1/projects/' + projectId + '/configs', {
    origin: api.runtimeconfigOrigin,
    data: {
      name: 'projects/' + projectId + '/configs/firebase',
      description: 'Firebase Functions runtime environment configuration.'
    },
    auth: true
  }).catch(function(err) {
    var statusCode = _.get(err, 'context.response.statusCode');
    // if already exists, resolve successfully
    if (statusCode === 409) {
      return RSVP.resolve();
    } else if (statusCode === 403) {
      return ensureApiEnabled(projectId, 'runtimeconfig.googleapis.com', 'env').then(function() {
        return ensureConfig(projectId);
      });
    }

    return RSVP.reject(err);
  });
}

function fetchVariable(projectId, name, allow404) {
  var req = api.request('GET', '/v1beta1/projects/' + projectId + '/configs/firebase/variables/' + name, {
    origin: api.runtimeconfigOrigin,
    auth: true
  }).then(function(response) {
    try {
      return JSON.parse(response.body.text);
    } catch (e) {
      logger.debug('JSON parse error while fetching env variable "' + name + '"');
      return null;
    }
  });

  if (allow404) {
    req = req.catch(function(err) {
      if (_.get(err, 'context.response.statusCode') === 404) {
        logger.debug('[env] variable ' + name + ' was not found, returning `null`');
        return RSVP.resolve(null);
      }

      return RSVP.reject(err);
    });
  }

  return req;
}

function setVariable(projectId, name, value, create) {
  var path = '/v1beta1/projects/' + projectId + '/configs/firebase/variables';
  var body = {
    text: JSON.stringify(value)
  };

  if (create) {
    body.name = 'projects/' + projectId + '/configs/firebase/variables/' + name;
  } else {
    path += '/' + name;
  }

  return api.request(create ? 'POST' : 'PUT', path, {
    origin: api.runtimeconfigOrigin,
    auth: true,
    data: body
  }).catch(function(err) {
    if (_.get(err, 'context.body.error.status') === 'NOT_FOUND') {
      return setVariable(projectId, name, value, true);
    }

    return RSVP.reject(err);
  });
}

function fetchLatest(projectId) {
  return fetchVariable(projectId, 'meta').then(function(meta) {
    meta = meta || {};
    if (!meta.version) {
      return {version: 'v0', data: meta.reserved || {}};
    }

    return fetchVariable(projectId, meta.version).then(function(fetched) {
      var data = _.assign({}, fetched, meta.reserved);
      return {
        version: meta.version,
        data: data
      };
    });
  }).catch(function(err) {
    logger.debug('[env] fetchLatest errored: ' + err.stack);
    // return an empty object if no env has been set
    if (_.get(err, 'context.response.statusCode') === 404) {
      return {
        version: 'v0',
        data: {}
      };
    }

    return RSVP.reject(err);
  });
}

function ensureMeta(projectId, instance) {
  var fetchVariablePromise = fetchVariable(projectId, 'meta', true);
  var fetchBucketPromise = gcp.storage.buckets.getDefault(projectId);
  var fetchKeyPromise = gcp.apikeys.getServerKey(projectId);
  return RSVP.all([fetchVariablePromise, fetchBucketPromise, fetchKeyPromise]).then(function(results) {
    var meta = results[0] || {};
    var firebaseConfig = {
      databaseURL: utils.addSubdomain(api.realtimeOrigin, instance),
      storageBucket: results[1],
      apiKey: results[2],
      authDomain: instance + '.firebaseapp.com'
    };
    var value = _.assign({}, meta, {
      reserved: {
        firebase: firebaseConfig
      }
    });

    if (_.isEqual(meta, value)) {
      return RSVP.resolve(value);
    }

    return setVariable(projectId, 'meta', value).then(function() {
      return RSVP.resolve(value);
    });
  });
}

function setMetaVersion(projectId, version) {
  return fetchVariable(projectId, 'meta', true).then(function(meta) {
    meta = meta || {};
    var value = _.assign({}, meta, {
      version: version
    });

    return setVariable(projectId, 'meta', value);
  });
}

exports.ensureSetup = function(options) {
  var projectId = getProjectId(options);
  var instance = options.instance;

  return ensureConfig(projectId).then(function() {
    return ensureMeta(projectId, instance);
  });
};

exports.get = function(projectId) {
  return ensureConfig(projectId).then(function() {
    return fetchLatest(projectId);
  });
};

exports.set = function(projectId, value, version) {
  return setVariable(projectId, version, value).then(function() {
    return setMetaVersion(projectId, version);
  });
};

exports.clone = function(fromProject, toProject, only, except) {
  var ctx = {};
  return fetchVariable(fromProject, 'meta').then(function(fromMeta) {
    if (!fromMeta || !fromMeta.version) {
      return RSVP.reject(new Error('No existing version found.'));
    }

    return fetchVariable(fromProject, fromMeta.version);
  }).catch(function() {
    return RSVP.reject(new FirebaseError('Project ' + chalk.bold(fromProject) + ' does not have environment configured.'));
  }).then(function(fromData) {
    ctx.fromData = fromData;
    return exports.get(toProject);
  }).then(function(latest) {
    ctx.data = latest.data;
    if (only) {
      only.forEach(function(key) {
        _.set(ctx.data, key, _.get(ctx.fromData, key));
      });
    } else if (except) {
      var fromData = _.assign({}, ctx.fromData);
      except.forEach(function(key) {
        _.unset(fromData, key);
      });
      _.assign(ctx.data, fromData);
    } else {
      _.assign(ctx.data, ctx.fromData);
    }

    return exports.set(toProject, ctx.data, exports.nextVersion(latest.version));
  }).then(function() {
    return ctx.data;
  });
};

exports.nextVersion = function(version) {
  var match = version.match(/^v([0-9]+)$/);
  if (!match) {
    throw new FirebaseError('Invalid environment version: ' + version);
  }

  return 'v' + (parseInt(match[1], 10) + 1).toString();
};

exports.applyArgs = function(base, args) {
  var changed = [];
  args.forEach(function(arg) {
    var parts = arg.split('=');
    if (parts.length < 2) {
      throw new FirebaseError('Invalid argument ' + chalk.bold(arg) + ', must be in key=val format');
    }

    var key = parts[0];
    var value = parts.slice(1).join('=');
    var namespace = key.split('.')[0];

    if (_.includes(exports.RESERVED_NAMESPACES, namespace.toLowerCase())) {
      throw new FirebaseError('Cannot set to reserved namespace ' + chalk.bold(namespace));
    }

    try {
      value = JSON.parse(value);
    } catch (e) {
      // do nothing
    }

    if (_.has(base, key) && value !== _.get(base, key)) {
      changed.push(key);
    }
    _.set(base, key, value);
  });

  return changed;
};

exports.applyUnsetArgs = function(base, args) {
  var existed = [];
  args.forEach(function(arg) {
    if (_.has(base, arg)) {
      existed.push(arg);
    }

    _.unset(base, arg);
  });
  return existed;
};
