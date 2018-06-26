/**************/
/*  REQUIRES  */
/**************/
var gulp = require("gulp");

// File I/O
var exit = require("gulp-exit");
var eslint = require("gulp-eslint");

// Testing
var mocha = require("gulp-mocha");
var istanbul = require("gulp-istanbul");

var _ = require("lodash");

/****************/
/*  FILE PATHS  */
/****************/
var paths = {
  js: ["index.js", "lib/**/*.js", "commands/**/*.js"],

  tests: ["test/**/*.spec.js"],

  scripts: ["scripts/*.js"],
};

/***********/
/*  TASKS  */
/***********/
// Lints the JavaScript files
gulp.task("lint", function() {
  var filesToLint = _.union(paths.js, paths.tests, paths.scripts);
  return gulp
    .src(filesToLint)
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
});

// Runs the Mocha test suite
gulp.task("test", function() {
  return gulp
    .src(paths.js)
    .pipe(istanbul())
    .pipe(istanbul.hookRequire())
    .on("finish", function() {
      gulp
        .src(paths.tests)
        .pipe(
          mocha({
            reporter: "spec",
            timeout: 5000,
          })
        )
        .pipe(istanbul.writeReports())
        .pipe(exit());
    });
});

// Reruns the linter every time a JavaScript file changes
gulp.task("watch", function() {
  gulp.watch(paths.js, gulp.series("lint"));
});

// Default task
gulp.task("default", gulp.series("lint", "test"));
