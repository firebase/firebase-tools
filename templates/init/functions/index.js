var functions = require('firebase-functions');

// // converts the "text" key of messages pushed to /messages to uppercase
// exports.upperCaser = functions.database().path('/messages/{id}').on('value', function(event) {
//   // prevent infinite loops
//   if (event.data.child('uppercased').val()) { return; }
//
//   return event.data.ref.update({
//     text: event.data.child('text').val().toUpperCase(),
//     uppercased: true
//   });
// });
