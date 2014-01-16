module.exports = {
  showHelp: function(command) {
    switch (command) {

      // Top-level functionality

      case 'login':
        console.log('login');
        break;
      case 'logout':
        console.log('logout');
        break;
      case 'ls':
      case 'list':
        console.log('list');
        break;

      // Submodules

      case 'init':
      case 'initialise':
      case 'initialize':
        console.log('init');
        break;
      case 'bootstrap':
        console.log('bootstrap');
        break;
      case 'deploy':
        console.log('deploy');
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
                    '    firebaseapp.com if it doesn\'t exist already.\n' +
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
                    '    Displays the current version.\n');
    }
  },
  showVersion: function() {
    console.log('\n' +
                'Firebase Command Line Tools\n' +
                'Version ' + this.version + '\n' +
                'https://www.firebase.com\n');
  }
}