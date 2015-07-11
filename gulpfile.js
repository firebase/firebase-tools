/**************/
/*  REQUIRES  */
/**************/
var gulp = require('gulp');

// File I/O
var exit = require('gulp-exit');
var jshint = require('gulp-jshint');

// Testing
var mocha = require('gulp-mocha');
var istanbul = require('gulp-istanbul');


/****************/
/*  FILE PATHS  */
/****************/
var paths = {
  js: [
    'index.js',
    'lib/*.js',
    'commands/*.js'
  ],

  tests: [
    'test/**/*.spec.js'
  ]
};


/***********/
/*  TASKS  */
/***********/
// Lints the JavaScript files
gulp.task('lint', function() {
  return gulp.src(paths.js)
    .pipe(jshint())
    .pipe(jshint.reporter('jshint-stylish'))
    .pipe(jshint.reporter('fail'))
    .on('error', function(error) {
      throw error;
    });
});

// Runs the Mocha test suite
gulp.task('test', function() {
  return gulp.src(paths.js)
    .pipe(istanbul())
    .pipe(istanbul.hookRequire())
    .on('finish', function () {
      gulp.src(paths.tests)
        .pipe(mocha({
          reporter: 'spec',
          timeout: 5000
        }))
        .pipe(istanbul.writeReports())
        .pipe(exit());
    });
});

// Reruns the linter every time a JavaScript file changes
gulp.task('watch', function() {
  gulp.watch(paths.js, ['lint']);
});

// Default task
gulp.task('default', ['lint', 'test']);
