var functions = require('firebase-functions');

// // Uppercases the value of the data when a write event occurs for
// // child nodes of '/uppercase' in the Firebase Realtime Database.
//
// exports.makeUpperCase = functions.database().path('/uppercase/{childId}')
//   .on('write', function(event) {
//   // For an explanation of this code, see "Handle Database Events"
//   var old = event.data.val();
//   console.log("Uppercasing", event.params.childId, old);
//   var uppercase = old.toUpperCase()
//   // Don't do anything if val() was already upper cased.
//   if (old == uppercase) {
//     return null;
//   }
//   return event.data.ref.set(uppercase);
// });
