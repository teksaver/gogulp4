/*
 * Copyright (c) 2015 Martin Donath
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

/* ----------------------------------------------------------------------------
 * Imports
 * ------------------------------------------------------------------------- */

var gulp       = require('gulp');
var addsrc     = require('gulp-add-src');
var args       = require('yargs').argv;
var autoprefix = require('autoprefixer-core');
var clean      = require('del');
var collect    = require('gulp-rev-collector');
var concat     = require('gulp-concat');
var ignore     = require('gulp-ignore');
var mincss     = require('gulp-minify-css');
var minhtml    = require('gulp-htmlmin');
var modernizr  = require('gulp-modernizr');
var mqpacker   = require('css-mqpacker');
var notifier   = require('node-notifier');
var gulpif     = require('gulp-if');
var pixrem     = require('pixrem');
var plumber    = require('gulp-plumber');
var postcss    = require('gulp-postcss');
var reload     = require('gulp-livereload');
var rev        = require('gulp-rev');
var sass       = require('gulp-sass');
var sourcemaps = require('gulp-sourcemaps');
var sync       = require('gulp-sync')(gulp).sync;
var child      = require('child_process');
var uglify     = require('gulp-uglify');
var util       = require('gulp-util');
var vinyl      = require('vinyl-paths');

/* ----------------------------------------------------------------------------
 * Locals
 * ------------------------------------------------------------------------- */

/* Application server */
var server = null;

/* ----------------------------------------------------------------------------
 * Overrides
 * ------------------------------------------------------------------------- */

/*
 * Override gulp.src() for nicer error handling.
 */
var src = gulp.src;
gulp.src = function() {
  return src.apply(gulp, arguments)
    .pipe(plumber(function(error) {
      util.log(util.colors.red(
        'Error (' + error.plugin + '): ' + error.message
      ));
      notifier.notify({
        title: 'Error (' + error.plugin + ')',
        message: error.message.split('\n')[0]
      });
      this.emit('end');
    })
  );
};

/* ----------------------------------------------------------------------------
 * Assets pipeline
 * ------------------------------------------------------------------------- */

/*
 * Build stylesheets from SASS source.
 */
gulp.task('assets:stylesheets', function() {
  return gulp.src('assets/stylesheets/*.scss')
    .pipe(gulpif(args.sourcemaps, sourcemaps.init()))
    .pipe(sass({
      includePaths: [
        /* Your SASS dependencies via bower_components */
      ]}))
    .pipe(gulpif(args.production,
      postcss([
        autoprefix(),
        mqpacker,
        pixrem('10px')
      ])))
    .pipe(gulpif(args.sourcemaps, sourcemaps.write()))
    .pipe(gulpif(args.production, mincss()))
    .pipe(gulp.dest('public/stylesheets/'))
    .pipe(reload());
});

/*
 * Build javascripts from Bower components and source.
 */
gulp.task('assets:javascripts', function() {
  return gulp.src([
    /* Your JS dependencies via bower_components */
    /* Your JS libraries */
  ]).pipe(gulpif(args.sourcemaps, sourcemaps.init()))
    .pipe(concat('application.js'))
    .pipe(gulpif(args.sourcemaps, sourcemaps.write()))
    .pipe(gulpif(args.production, uglify()))
    .pipe(gulp.dest('public/javascripts/'))
    .pipe(reload());
});

/*
 * Create a customized modernizr build.
 */
gulp.task('assets:modernizr', function() {
  return gulp.src([
    'public/stylesheets/style.css',
    'public/javascripts/application.js'
  ]).pipe(
      modernizr({
        options: [
          'addTest',                   /* Add custom tests */
          'fnBind',                    /* Use function.bind */
          'html5printshiv',            /* HTML5 support for IE */
          'setClasses',                /* Add CSS classes to root tag */
          'testProp'                   /* Test for properties */
        ]
      }))
    .pipe(addsrc.append('bower_components/respond/dest/respond.src.js'))
    .pipe(concat('modernizr.js'))
    .pipe(gulpif(args.production, uglify()))
    .pipe(gulp.dest('public/javascripts'));
});

/*
 * Minify views.
 */
gulp.task('assets:views', args.production ? [
  'assets:revisions:clean',
  'assets:revisions'
] : [], function() {
  return gulp.src([
    'manifest.json',
    'views/**/*.tmpl'
  ]).pipe(gulpif(args.production, collect()))
    .pipe(
      minhtml({
        collapseBooleanAttributes: true,
        collapseWhitespace: true,
        removeComments: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        minifyCSS: true,
        minifyJS: true
      }))
    .pipe(gulp.dest('.views'));
});

/*
 * Clean outdated revisions.
 */
gulp.task('assets:revisions:clean', function() {
  return gulp.src(['public/**/*.{css,js}'])
    .pipe(ignore.include(/-[a-f0-9]{8}\.(css|js)$/))
    .pipe(vinyl(clean));
});

/*
 * Revision assets after build.
 */
gulp.task('assets:revisions', [
  'assets:revisions:clean'
], function() {
  return gulp.src(['public/**/*.{css,js}'])
    .pipe(ignore.exclude(/-[a-f0-9]{8}\.(css|js)$/))
    .pipe(rev())
    .pipe(gulp.dest('public'))
    .pipe(rev.manifest('manifest.json'))
    .pipe(gulp.dest('.'));
})

/*
 * Build assets.
 */
gulp.task('assets:build', [
  'assets:stylesheets',
  'assets:javascripts',
  'assets:modernizr',
  'assets:views'
]);

/*
 * Watch assets for changes and rebuild on the fly.
 */
gulp.task('assets:watch', function() {

  /* Rebuild stylesheets on-the-fly */
  gulp.watch([
    'assets/stylesheets/**/*.scss'
  ], ['assets:stylesheets']);

  /* Rebuild javascripts on-the-fly */
  gulp.watch([
    'assets/javascripts/**/*.js',
    'bower.json'
  ], ['assets:javascripts']);

  /* Minify views on-the-fly */
  gulp.watch([
    'views/**/*.tmpl'
  ], ['assets:views']);
});

/* ----------------------------------------------------------------------------
 * Application server
 * ------------------------------------------------------------------------- */

/*
 * Build application server.
 */
gulp.task('server:build', function() {
  var build = child.spawnSync('go', ['install']);
  if (build.stderr.length) {
    var lines = build.stderr.toString()
      .split('\n').filter(function(line) {
        return line.length
      });
    for (var l in lines)
      util.log(util.colors.red(
        'Error (go install): ' + lines[l]
      ));
    notifier.notify({
      title: 'Error (go install)',
      message: lines
    });
  }
  return build;
});

/*
 * Restart application server.
 */
gulp.task('server:spawn', function() {
  if (server)
    server.kill();

  /* Spawn application server */
  server = child.spawn('your-server-binary-goes-here');

  /* Trigger reload upon server start */
  server.stdout.once('data', function() {
    reload.reload('/');
  });

  /* Pretty print server log output */
  server.stdout.on('data', function(data) {
    var lines = data.toString().split('\n')
    for (var l in lines)
      if (lines[l].length)
        util.log(lines[l]);
  });

  /* Print errors to stdout */
  server.stderr.on('data', function(data) {
    process.stdout.write(data.toString());
  });
});

/*
 * Watch source for changes and restart application server.
 */
gulp.task('server:watch', function() {

  /* Restart application server */
  gulp.watch([
    '.views/**/*.tmpl',
    'locales/*.json'
  ], ['server:spawn']);

  /* Rebuild and restart application server */
  gulp.watch([
    '*/**/*.go',
  ], sync([
    'server:build',
    'server:spawn'
  ], 'server'));
});

/* ----------------------------------------------------------------------------
 * Interface
 * ------------------------------------------------------------------------- */

/*
 * Build assets and application server.
 */
gulp.task('build', [
  'assets:build',
  'server:build'
]);

/*
 * Start asset and server watchdogs and initialize livereload.
 */
gulp.task('watch', [
  'assets:build',
  'server:build'
], function() {
  reload.listen();
  return gulp.start([
    'assets:watch',
    'server:watch',
    'server:spawn'
  ]);
});

/*
 * Build assets by default.
 */
gulp.task('default', ['build']);