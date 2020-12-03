// IMPORTANT NOTE
// This is not my code, I got it from this Medium article: https://medium.com/@devesu/how-to-upload-data-to-firebase-firestore-cloud-database-63543d7b34c5
// The author of this code is Devesu
// @author Devesu

const firebaseAdmin = require("./node_modules/firebase-admin");

/**
 * Uploads all entries in JSON file to the specified firestore database collection.
 *
 * @param {string} serviceAccountKeyFilePath The file path to service account key.
 * @param {string} dataFilePath The file path for the data you want to upload.
 * @param {string} targetCollectionName Name of the collection you want to upload to.
 * @param {string} firestoreDatabaseURL The URL of the Firestore database you want to upload.
 * @param {boolean} dockeyInData Specifies if the JSON data already has a column named "dockey". If false, we will auto-generate dockeys.
 */
function uploadJSON(
  serviceAccountKeyFilePath,
  dataFilePath,
  targetCollectionName,
  firestoreDatabaseURL,
  dockeyInData
) {
  // A file object containing JSON that you want to upload
  // Author of resolve path code snippet is Antrikshy: https://stackoverflow.com/questions/26311577/node-js-cannot-require-a-js-file-in-the-same-directory/26313829
  var path = require("path");
  const dataFile = require(path.resolve(__dirname, dataFilePath));

  // A file object containing your Firestore service account key info
  const serviceAccountKeyFile = require(path.resolve(__dirname, serviceAccountKeyFilePath));

  // Initialize firebase-admin with your database URL and service account key
  firebaseAdmin.initializeApp({
    databaseURL: firestoreDatabaseURL,
    credential: firebaseAdmin.credential.cert(serviceAccountKeyFile),
  });

  // Firestore database instance
  const firestore = firebaseAdmin.firestore();

  // Accomodate change in timestamp behavior in Firestore
  firestore.settings({ timestampsInSnapshots: true });

  // Ensure that we were able to open the JSON data file and create a file object with it
  if (dataFile && typeof dataFile === "object") {
    // If dockey is being used in the dataset, continue the upload. Else, auto-generate dockeys first.
    if (dockeyInData === "true") {
      // Iterate over each of the dockeys in the JSON file and upload individually to Firestore
      Object.keys(dataFile).forEach((docKey) => {
        // The .set() method is used to perform the upload
        firestore
          .collection(targetCollectionName)
          .doc(docKey)
          .set(dataFile[docKey])
          .then((res) => {
            console.log("Uploaded a new document");
          })
          .catch((err) => {
            // Error case
            console.error("There was an issue: ", err);
          });
      });
    } else {
      console.log("Auto generating dockeys");
      // Iterate over each of the dockeys in the JSON file and upload individually to Firestore
      Object.keys(dataFile).forEach((docKey) => {
        // The .set() method is used to perform the upload
        firestore
          .collection(targetCollectionName)
          .doc()
          .set(dataFile[docKey])
          .then((res) => {})
          .catch((err) => {
            // Error case
            console.error("There was an issue: ", err);
          });
      });
    }
  } else {
    // Error case where dataFile is not a valid file path or could not be used for some other reason
    console.error("dataFile " + dataFile + " is invalid");
  }
}

// uploadJSON is called with: privateKey jsonFile collectionName dbURL docKey
var myArgs = process.argv.slice(2);
uploadJSON(myArgs[0], myArgs[1], myArgs[2], myArgs[3], myArgs[4]);

// IMPORTANT NOTE
// This is not my code, I got it from this Medium article: https://medium.com/@devesu/how-to-upload-data-to-firebase-firestore-cloud-database-63543d7b34c5
// The author of this code is Devesu
// @author Devesu
