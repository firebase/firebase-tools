var optimist = require('optimist'),
    Auth = require('./auth');

function App() {
  // TODO: Ensure valid route
  var validRoute = true;
  if (validRoute) {
    Auth.requireLogin(function(err) {
        if (err) {
          console.log("Sorry, we couldn't log you in");
          return;
        }
        // TODO: App-specific router
        console.log('app', optimist.argv);
      }
    );
  } else {
    optimist.showHelp();
  }
}

module.exports = App;
