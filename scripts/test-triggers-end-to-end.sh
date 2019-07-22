#!/bin/bash

set -xe

FIREBASE_CLI="./lib/bin/firebase.js"

if ! [ -x $FIREBASE_CLI ];
then
  echo "marking $FIREBASE_CLI user/group executable"
  chmod ug+x $FIREBASE_CLI
fi;

$FIREBASE_CLI setup:emulators:firestore
$FIREBASE_CLI setup:emulators:database

cd ./scripts/triggers-end-to-end-tests

npm install && npm test
