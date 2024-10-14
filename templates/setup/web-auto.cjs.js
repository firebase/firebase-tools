const { initializeApp } = require('firebase/app');
function autoInitApp() {
    return initializeApp({/*--CONFIG--*/});
}
exports.autoInitApp = autoInitApp;