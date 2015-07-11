var chai = require('chai'),
    expect = chai.expect;

var loadConfig = require('../../lib/loadConfig');
var FirebaseError = require('../../lib/error');

describe('loading config', function() {
  it('should load the config if the cwd has a firebase.json', function() {
    expect(
      loadConfig(__dirname + "/../fixtures/valid-config")
    ).to.have.property('firebase');
  });

  it('should throw a FirebaseError if the cwd does not have a firebase.json', function() {
    expect(function() {
      loadConfig(__dirname)
    }).to.throw(FirebaseError)
  });
});
