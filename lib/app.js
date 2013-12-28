var optimist = require('optimist'),
    Auth = require('./auth');

function App() {
  // TODO: Ensure valid route
  var validRoute = true;
  if (validRoute) {
    Auth.requireLogin(function() {
        // TODO: App-specific router
        console.log('app', optimist.argv);
      },
      function() {
        console.log("Sorry, we couldn't log you in");
      },
      this
    );
  } else {
    optimist.showHelp();
  }
}

module.exports = App;
