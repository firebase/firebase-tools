var optimist = require('optimist'),
    argv = optimist.argv,
    fs = require('fs'),
    path = require('path'),
    prompt = require('prompt'),
    Auth = require('./auth');

var routes = {
  init: function() {
    if (fs.existsSync(this.settingsFile)) {
      console.log('Directory already initialized');
      return;
    }
    var that = this,
        schema = {
          properties: {
            firebase: {
              required: true,
              pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9]|)$/,
              description: 'Firebase',
              message: 'Please enter the firebase you wish to associate this site' +
                       ' with'
            }
          }
        };
    prompt.get(schema, function(err, result) {
      if (err) {
        return;
      }
      Auth.checkCanAccess(result.firebase, function(err) {
        if (err) {
          console.log('You do not have permission to use that Firebase');
          return;
        }
        var settings = {
          firebase: result.firebase,
          ignore: [
            'firebase.json',
            'rules.json'
          ],
          rules: 'rules.json'
        };
        var settingsJSON = JSON.stringify(settings, null, 2) + "\n";
        try {
          fs.writeFileSync(that.settingsFile, settingsJSON);
          console.log('Initialized app into current directory')
        } catch(err) {
          console.log('Could not save file');
        }
      });
    });
  },
  bootstrap: function() {
    console.log('bootstrap');
  },
  deploy: function() {
    console.log('deploy');
  }
};

function App() {
  var that = this;
  this.settingsFile = path.resolve('./firebase.json');
  if ((argv._.length > 1) && (routes.hasOwnProperty(argv._[1]))) {
    Auth.requireLogin(function(err) {
      if (err) {
        console.log("Sorry, we couldn't log you in");
        return;
      }
      routes[argv._[1]].bind(that)();
    });
  } else {
    // TODO: Print module level help
    optimist.showHelp();
  }
}

module.exports = App;
