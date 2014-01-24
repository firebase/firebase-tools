var firebase = require('./firebase');

module.exports = {
  showHelp: function(command) {
    switch (command) {

      // Top-level functionality

      case 'login':
        console.log('\n' +
                    '  firebase login\n' +
                    '    Logs the user into Firebase. All commands that require login will prompt\n' +
                    '    you if you\'re not currently logged in.\n' +
                    '\n' +
                    '    Optional command line parameters:\n' +
                    '\n' +
                    '      --email     The email address of the account\n' +
                    '      --password  The password of the account\n' +
                    '\n' +
                    '    Stores the email address and access token granted from Firebase in a\n' +
                    '    .firebaserc settings file in the user\'s home directory. Access tokens\n' +
                    '    are valid for up to 30 days.\n');
        break;
      case 'logout':
        console.log('\n' +
                    '  firebase logout\n' +
                    '    Logs the user out of Firebase.\n' +
                    '\n' +
                    '    Optional command line parameters:\n' +
                    '\n' +
                    '      -d  Flag to delete the .firebaserc settings file entirely\n' +
                    '\n' +
                    '    Invalidates and removes the access token from the .firebaserc settings file\n' +
                    '    in the user\'s home directory. Optionally deletes the entire settings file.\n');
        break;
      case 'ls':
      case 'list':
        console.log('\n' +
                    '  firebase list\n' +
                    '    Lists the Firebases available to the currently logged in user.\n' +
                    '\n' +
                    '    If the user is not currently logged in, they are prompted to do so - see\n' +
                    '    `firebase login --help` for more details.\n');
        break;

      // Submodules

      case 'init':
      case 'initialise':
      case 'initialize':
        console.log('\n' +
                    '  firebase init\n' +
                    '    Initializes an existing Firebase app in the current directory and prompts\n' +
                    '    you through configuring it for firebaseapp.com.\n' +
                    '\n' +
                    '    Optional command line parameters:\n' +
                    '\n' +
                    '      -f, --firebase  The Firebase to initalize the app with. The current user\n' +
                    '                      must have access to this Firebase. This is used for the\n' +
                    '                      subdomain of firebaseapp.com\n' +
                    '      -p, --public    A directory containing all of the app\'s static files that\n' +
                    '                      should uploaded when deploying. Defaults to the current\n' +
                    '                      directory.\n' +
                    '      -r, --rules     An optional file that contains security rules for the\n' +
                    '                      Firebase that will be set when deploying. Defaults to\n' +
                    '                      none.\n' +
                    '\n' +
                    '    Generates a firebase.json file in the current directory for all the settings\n' +
                    '    required for deploy. If the user is not currently logged in, they are\n' +
                    '    prompted to do so - see `firebase login --help` for more details.\n');
        break;
      case 'bootstrap':
        console.log('\n' +
                    '  firebase bootstrap\n' +
                    '    Creates a new Firebase powered app from a number of prebuild templates to\n' +
                    '    quickly get a project up and running. This creates a new folder and prompts\n' +
                    '    you through all the required settings.\n' +
                    '\n' +
                    '    Optional command line parameters:\n' +
                    '\n' +
                    '      -f, --firebase  The Firebase to initalize the app with. The current user\n' +
                    '                      must have access to this Firebase. This is used for the\n' +
                    '                      subdomain of firebaseapp.com\n' +
                    '      -t, --template  The name of the template to bootstrap the app with. The\n' +
                    '                      currently available templates are:\n' +
                    '\n' +
                    '                        angular - https://github.com/firebase/angularFire-seed\n' +
                    '                          The angularFire seed template\n' +
                    '\n' +
                    '                        chat - https://github.com/firebase/chat-seed\n' +
                    '                          A very simple Firebase powered chat template\n' +
                    '\n' +
                    '    Downloads and unpacks the template into a folder named after the Firebase\n' +
                    '    with which it has been initialized. Creates a firebase.json file in the\n' +
                    '    directory with some pre-configured settings appropriate for the template.\n' +
                    '    If the user is not currently logged in, they are prompted to do so - see\n' +
                    '    `firebase login --help` for more details.\n');
        break;
      case 'deploy':
        console.log('\n' +
                    '  deploy\n' +
                    '    Deploys the current app to Firebase Hosting and creates your subdomain on\n' +
                    '    firebaseapp.com if it doesn\'t already exist.\n' +
                    '\n' +
                    '    Uploads the directory detailed in the firebase.json settings file and\n' +
                    '    updates the security rules of the Firebase if specified. The current user\n' +
                    '    must have access to the Firebase in firebase.json, and if the user is not\n' +
                    '    currently logged in, they are prompted to do so - see\n' +
                    '    `firebase login --help` for more details.\n');
        break;

      default:
        this.showVersion();
        console.log('Usage: firebase <command>\n' +
                    '\n' +
                    '  Available commands are:\n' +
                    '\n' +
                    '  bootstrap\n' +
                    '    Creates a new Firebase powered app from a number of prebuild templates to\n' +
                    '    quickly get a project up and running. This creates a new folder and prompts\n' +
                    '    you through all the required settings.\n' +
                    '\n' +
                    '  deploy\n' +
                    '    Deploys the current app to Firebase Hosting and creates your subdomain on\n' +
                    '    firebaseapp.com if it doesn\'t already exist.\n' +
                    '\n' +
                    '  init\n' +
                    '    Initializes an existing Firebase app in the current directory and prompts\n' +
                    '    you through configuring it for firebaseapp.com.\n' +
                    '\n' +
                    '  list\n' +
                    '    Lists the Firebases available to the currently logged in user.\n' +
                    '\n' +
                    '  login\n' +
                    '    Logs you into Firebase. All commands that require login will prompt\n' +
                    '    you if you\'re not currently logged in.\n' +
                    '\n' +
                    '  logout\n' +
                    '    Logs you out of Firebase.\n' +
                    '\n' +
                    '  -h, --help\n' +
                    '    Shows this help screen. Use `firebase <command> --help` for more detailed\n' +
                    '    help instructions.\n' +
                    '\n' +
                    '  -v, --version\n' +
                    '    Displays the current version.\n' +
                    '\n' +
                    'For a quick start guide, see https://www.firebase.com/docs/hosting.html\n');
    }
  },
  showVersion: function() {
    console.log('\n' +
                'Firebase Command Line Tools\n' +
                'Version ' + firebase.version + '\n' +
                'https://www.firebase.com\n');
  }
}