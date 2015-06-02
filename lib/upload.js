var request = require('request'),
    auth = require('./auth'),
    api = require('./api'),
    fstreamIgnore = require('fstream-ignore'),
    tar = require('tar'),
    zlib = require('zlib'),
    fs = require('fs'),
    path = require('path'),
    chalk = require('chalk'),
    util = require('util'),
    stream = require('stream'),
    filesize = require('filesize');

module.exports = {
  send: function(firebase, publicDir, ignoreRules, pushId, message, callback) {
    var fileCount = 0,
        actualSizeBytes = 0,
        buffers = [],
        foundIndex = false,
        indexPath = path.resolve(path.join(publicDir, 'index.html'));

    console.log('Preparing to deploy Public Directory...');

    var Minimatch = require("minimatch").Minimatch;
    var ignoreMatchers = ignoreRules.map(function (pattern) {
      return new Minimatch(pattern, { matchBase: true, dot: true, flipNegate: true });
    });

    function include(entry, partial) {
      var included = true;

      // Negated Rules
      // Since we're *ignoring* things here, negating means that a file
      // is re-included, if it would have been excluded by a previous
      // rule.  So, negated rules are only relevant if the file
      // has been excluded.
      //
      // Similarly, if a file has been excluded, then there's no point
      // trying it against rules that have already been applied
      //
      // We're using the "flipnegate" flag here, which tells minimatch
      // to set the "negate" for our information, but still report
      // whether the core pattern was a hit or a miss.

      if (!ignoreRules) {
        return included;
      }

      ignoreMatchers.forEach(function (matcher) {
        // negation means inclusion
        if (matcher.negate && included ||
            !matcher.negate && !included) {
          // unnecessary
          return;
        }

        // first, match against /foo/bar
        var match = matcher.match("/" + entry);

        if (!match) {
          // try with the leading / trimmed off the test
          // eg: foo/bar instead of /foo/bar
          match = matcher.match(entry);
        }

        // if the entry is a directory, then it will match
        // with a trailing slash. eg: /foo/bar/ or foo/bar/
        if (!match && partial) {
          match = matcher.match("/" + entry + "/") ||
                  matcher.match(entry + "/");
        }

        // When including a file with a negated matcher, it's
        // relevant if a directory partially matches, since
        // it may then match a file within it.
        // Eg, if you ignore /a, but !/a/b/c
        if (!match && matcher.negate && partial) {
          match = matcher.match("/" + entry, true) ||
                  matcher.match(entry, true);
        }

        if (match) {
          included = matcher.negate;
        }
      });
      return included;
    }

    function walk(dir, done) {
      var results = [];
      fs.readdir(dir, function(err, paths) {
        if (err) return done(err);
        var pending = paths.length;
        if (!pending) return done(null, results);
        paths.forEach(function(base) {
          var fullPath = path.resolve(dir, base);
          fs.stat(fullPath, function(err, stat) {
            if (stat && stat.isDirectory()) {
              if (include(path.relative(publicDir, fullPath), true)) {
                walk(fullPath, function(err, res) {
                  results = results.concat(res);
                  if (!--pending) done(null, results);
                });
              } else {
                if (!--pending) done(null, results);
              }
            } else {
              if (include(path.relative(publicDir, fullPath), false)) {
                fileCount++;
                actualSizeBytes += stat.size;
                results.push(fullPath);
                if (fullPath === indexPath) {
                  foundIndex = true;
                }
              }
              if (!--pending) done(null, results);
            }
          });
        });
      });
    };

    walk(publicDir, function(err, results) {
      if (err) throw err;
      console.log(results);
      console.log('# of files = ' + fileCount + ', total size(bytes) = ' + actualSizeBytes);
      if (fileCount === 0) {
        console.log(chalk.yellow('Public Directory Warning') + ' - Public ' +
                        'directory is empty, removing site');
      } else if (!foundIndex) {
        console.log(chalk.yellow('Public Directory Warning') + ' - Public ' +
                        'directory does not contain an index.html\n' +
                        'Make sure you\'re deploying the right public directory: ' +
                        chalk.bold(path.resolve(publicDir)));
      } else if (fileCount > 500 || actualSizeBytes > 500*1024*1024) {
        console.log(chalk.yellow('Public Directory Warning') + ' - Uploading ' +
                        fileCount + ' files with total compressed size = ' + filesize(actualSizeBytes));
      } else {
        console.log('Uploading ' + fileCount + ' files with total compressed size = ' + filesize(actualSizeBytes));
      }

      var reader = fstreamIgnore({
          path: publicDir,
          type: 'Directory',
          follow: true
        });
      reader.addIgnoreRules(ignoreRules);

      reader.on('error', function(err) {
        console.log(chalk.red('READ ERROR') + ' - Could not read directory. Remove' +
                            ' symbolic links / shortcuts and try again.');
        process.exit(1);
      });

      var zipStream = reader.pipe(tar.Pack())
        .pipe(zlib.createGzip());

      console.log('zipStream created ----------');

      var params = ['id=' + encodeURIComponent(pushId), 'fileCount=' + fileCount, 'token=' + auth.token];
      if (message) {
        params.push('message=' + encodeURIComponent(message));
      }
      var url = api.uploadUrl + '/upload/' + firebase + '?' + params.join('&');

      var r = request.put({
        url: url,
        json: true
      }, function(err, response, body) {
        var failed = (err || !body || body.error);
        setTimeout(callback, 0, failed, body && body.directory);
      });
      var form = r.form();
      form.append('site', zipStream, {
        filename: 'site.tar.gz',
        contentType: 'application/x-gzip'
      });
    });
  },
  deleteSite: function(firebase, pushId, message, callback) {
    var params = ['id=' + encodeURIComponent(pushId), 'token=' + auth.token];
    if (message) {
      params.push('message=' + encodeURIComponent(message));
    }
    var url = api.uploadUrl + '/upload/' + firebase + '?' + params.join('&');

    var r = request({
      url: url,
      method: 'DELETE',
      json: true
    }, function(err, response, body) {
      var failed = (err || !body || body.error);
      setTimeout(callback, 0, failed, body && body.directory);
    });
  }
};
