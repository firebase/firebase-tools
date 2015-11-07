'use strict';
var _ = require('lodash');
var FirebaseError = require('./error');

module.exports = function(fnConfig, rules) {
  rules = _.assign({}, rules);
  if (!_.isPlainObject(fnConfig)) {
    throw new FirebaseError('"functions" must be an object or a file that resolves to an object.', {exit: 1});
  }

  _.forEach(fnConfig, function(val, name) {
    var trigger = _.get(val, 'triggers.database');
    if (!_.isPlainObject(trigger) || !_.isString(trigger.path) || _.startsWith(name, '.')) {
      return;
    }
    if (!_.startsWith(trigger.path, '/')) {
      throw new FirebaseError('Trigger for "' + name + '" must start with a /', {exit: 1});
    }

    var tpath = trigger.path.split('/').slice(1);
    tpath.push('.function');
    _.set(rules, tpath, {
      name: JSON.stringify(name),
      condition: trigger.condition || 'true'
    });
  });

  return rules;
};
