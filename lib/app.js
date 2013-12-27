var optimist = require('optimist');

function App(auth, argv) {
  // TODO: Ensure valid route
  var validRoute = true;
  if (validRoute) {
    auth.requireLogin(function() {
        // TODO: App-specific router
        console.log('app', argv);
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
