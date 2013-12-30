var Table = require('easy-table'),
    prompt = require('prompt'),
    Auth = require('./auth'),
    Api = require('./api');

var Firebase = {
  list: function() {
    var that = this;
    Auth.requireLogin(function(err) {
      if (err) {
        console.log('Could not list Firebases');
        return;
      }
      that._list();
    });
  },
  _list: function() {
    Api.request('GET', '/account', {}, true, function(statusCode, response) {
      if (typeof(response.firebases) !== 'undefined') {
        var t = new Table;
        for (var firebase in response.firebases) {
          if (response.firebases.hasOwnProperty(firebase)) {
            t.cell('Name', firebase);
            t.cell('Url', 'https://' + firebase + '.firebaseio.com');
            t.cell('Role', response.firebases[firebase].role);
            t.newRow();
          }
        }
        console.log("\n" + t.toString());
      }
    });
  },
  create: function() {
    var that = this;
    Auth.requireLogin(function(err) {
      if (err) {
        console.log('Could not list Firebases');
        return;
      }
      that._create();
    });
  },
  _create: function() {
    var that = this,
        schema = {
          properties: {
            name: {
              description: 'New Firebase name',
              pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9]|)$/,
              message: 'Your Firebase name may only contain [a-z], [0-9], and' +
                         ' hyphen (-). It may not start or end with a hyphen.',
              required: true
            }
          }
        };
    prompt.get(schema, function(err, result) {
      if (err) {
        return;
      }
      Api.request(
        'POST',
        '/firebase/' + result.name,
        {},
        true,
        function(statusCode, response) {
          if (response.success) {
            console.log('\nFirebase \'' + result.name + '\' created');
            that._list();
          } else {
            var errorMessage = '';
            if (typeof(response.error) !== 'undefined') {
              errorMessage = ': ' + response.error;
            }
            console.log('Could not create Firebase' + errorMessage);
          }
        }
      );
    });
  }
};

function initFirebase() {

}

initFirebase();

module.exports = Firebase;
