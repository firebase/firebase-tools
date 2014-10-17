var app = require('./app'),
    firebase = require('./firebase'),
    chalk = require('chalk');

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
                    '\n' +
                    '    Generates a firebase.json file in the current directory for all the settings\n' +
                    '    required for deploy. If the user is not currently logged in, they are\n' +
                    '    prompted to do so - see `firebase login --help` for more details.\n');
        break;
      case 'bootstrap':
        var helpOverview =
                    '\n' +
                    '  firebase bootstrap\n' +
                    '    Creates a new Firebase powered app from a prebuilt template to quickly\n' +
                    '    get a project up and running. This creates a new folder and prompts\n' +
                    '    you through all the required settings.\n' +
                    '\n' +
                    '    Optional command line parameters:\n' +
                    '\n' +
                    '      -f, --firebase  The Firebase to initalize the app with. The current user\n' +
                    '                      must have access to this Firebase. This is used for the\n' +
                    '                      subdomain of firebaseapp.com\n' +
                    '      -t, --template  The name of the template to bootstrap the app with.\n';

        var helpFooter = '\n' +
                    '    Downloads and unpacks the template into a folder named after the Firebase\n' +
                    '    with which it has been initialized. Creates a firebase.json file in the\n' +
                    '    directory with some pre-configured settings appropriate for the template.\n' +
                    '    If the user is not currently logged in, they are prompted to do so - see\n' +
                    '    `firebase login --help` for more details.\n';

        app.getTemplates()
          .done(function(templates) {
            var helpTemplates = '\n                      The currently available templates are:\n';
            var templateList = Object.keys(templates).sort();
            for (var i = 0; i < templateList.length; i++) {
              var key = templateList[i],
                  template = templates[key];
              helpTemplates += '\n                        ' + chalk.yellow(key);
              helpTemplates += (template.repository) ? ' - ' + template.repository + '\n' : '\n';
              if (template.description) {
                helpTemplates += '                          ' + template.description;
              }
              helpTemplates += '\n';
            }

            console.log(helpOverview + helpTemplates + helpFooter);
          }, function(error) {
            var errTemplates = '\n                      ';
            errTemplates += chalk.red('Error: ') + 'Could not retrieve available templates.\n';

            console.log(helpOverview + errTemplates + helpFooter);
          });
        break;
      case 'deploy':
        console.log('\n' +
                    '  firebase deploy\n' +
                    '    Deploys the current app to Firebase Hosting and creates your subdomain on\n' +
                    '    firebaseapp.com if it doesn\'t already exist.\n' +
                    '\n' +
                    '    Optional command line parameters:\n' +
                    '\n' +
                    '      -m, --message  An optional version message\n' +
                    '\n' +
                    '      -f, --firebase Overrides the Firebase setting in the firebase.json\n' +
                    '      -p, --public   Overrides the public directory setting in the\n' +
                    '                     firebase.json\n' +
                    '\n' +
                    '    Uploads the directory detailed in the firebase.json settings file and\n' +
                    '    updates the security rules of the Firebase if specified. The current user\n' +
                    '    must have access to the Firebase in firebase.json, and if the user is not\n' +
                    '    currently logged in, they are prompted to do so - see\n' +
                    '    `firebase login --help` for more details.\n');
        break;
      case 'delete-site':
        console.log('\n' +
                    '  firebase delete-site\n' +
                    '    Deletes the current app from Firebase Hosting and displays a \n' +
                    '    \'Site not Found\' page as if the site had never been deployed to.\n' +
                    '\n' +
                    '    Optional command line parameters:\n' +
                    '\n' +
                    '      -m, --message  An optional version message\n' +
                    '\n' +
                    '      -f, --firebase Overrides the Firebase setting in the firebase.json\n' +
                    '\n' +
                    '    Deletes the site associated with the Firebase detailed in the firebase.json\n' +
                    '    settings file. The current user must have access to the Firebase, and if\n' +
                    '    the user is not currently logged in, they are prompted to do so - see\n' +
                    '    `firebase login --help` for more details.\n');
        break;
      case 'open':
        console.log('\n' +
                    '  firebase open\n' +
                    '    Opens the current Firebase app\'s firebaseapp.com subdomain in a browser.\n' +
                    '\n' +
                    '    The current directory must have been initialized using firebase init or\n' +
                    '    firebase bootstrap\n');
        break;

      default:
        this.showVersion();
        console.log('Usage: firebase <command>\n' +
                    '\n' +
                    '  Available commands are:\n' +
                    '\n' +
                    '  bootstrap\n' +
                    '    Creates a new Firebase powered app from a prebuilt template to quickly\n' +
                    '    get a project up and running. This creates a new folder and prompts\n' +
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
                    '  open\n' +
                    '    Opens the URL of the current Firebase app in a browser.\n' +
                    '\n' +
                    '  list\n' +
                    '    Lists the Firebases available to the currently logged in user.\n' +
                    '\n' +
                    '  delete-site\n' +
                    '    Deletes the current app from Firebase Hosting and displays a \n' +
                    '    \'Site not Found\' page as if the site had never been deployed to.\n' +
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
                    '  -s, --silent\n' +
                    '    Silent mode for scripting - commands will error with non-zero status code\n' +
                    '    instead of waiting for prompt if not enough information supplied.\n' +
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
};
