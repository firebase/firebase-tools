var auth = require('./auth'),
    packageInfo = require('../package.json');

module.exports = {
  login: function() {
    auth.login(function(err) {
      if (err) {
        console.log('LOGIN UNSUCCESSFUL'.red);
        process.exit(1);
      } else {
        console.log('LOGIN SUCCESSFUL'.green);
      }
    });
  },
  logout: function(deleteAll) {
    auth.logout(deleteAll, function(err) {
      if (err) {
        console.log('LOG OUT UNSUCCESSFUL'.red);
        process.exit(1);
      } else {
        console.log('LOG OUT SUCCESSFUL'.green);
      }
    });
  },
  list: function() {
    var that = this;
    auth.requireLogin(function(err) {
      if (err) {
        console.log('LOGIN UNSUCCESSFUL'.red);
        process.exit(1);
     } else {
        auth.getFirebases(function(err, firebases) {
          if (err) {
            console.log('COULD NOT LIST FIREBASES'.red);
            process.exit(1);
          } else {
            console.log('---------- YOUR FIREBASES ----------'.green);
            console.log(firebases.join('\n'));
            console.log('------------------------------------'.green);
          }
        });
      }
    });
  },
  version: packageInfo.version || 0
}
