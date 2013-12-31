var optimist = require('optimist'),
    argv = optimist.argv,
    Auth = require('./auth');

var routes = {
  init: function() {
    console.log('init');
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
