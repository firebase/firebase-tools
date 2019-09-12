* Ensures `auth:export` results are fully flushed to the output file.
* Fix bug in Firestore emulator where concurrent requests for the same transaction would sometimes hang.
* Fix bug in Firestore emulator where WriteResults for deletes had an `update_time` populated.
* Set the predefined runtime environment variables in the functions emulator
