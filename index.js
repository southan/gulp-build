/* jshint node: true */
"use strict";

var getLazy = require( "./lib/lazy" );

/**
 * Our own little helper.
 *
 * @type {Object}
 */
var utils = getLazy({
	del       : "del",
	chalk     : "chalk",
	log       : "fancy-log",
	merge     : "merge-stream",
	notifier  : "node-notifier",
	path      : "path",
	plumber   : "gulp-plumber",
	prettyTime: "pretty-hrtime"
});

/**
 * Utility for creating and processing streams.
 *
 * @param   args
 * @param   args.files Glob pattern
 * @param   args.pipes An array of pipes to chain to the stream
 * @param   args.base  Base argument for gulp.src
 * @param   args.dest  Destination of stream
 * @returns stream
 */
function Build( args ) {
	var src = this.src( args.files, args.base ? { base: args.base } : null );

	if ( args.onError ) {
		src = src.pipe( utils.plumber( args.onError ) );
	}

	if ( args.pipes ) {
		args.pipes.forEach(function ( pipe ) {
			if ( pipe ) {
				src = src.pipe( pipe );
			}
		});
	}

	if ( args.dest ) {
		src = src.pipe( this.dest( args.dest ) );
	}

	return src;
}

/**
 * Default error callback for plumber.
 *
 * @param error
 */
function Error( error ) {
	utils.log.error( error.message );
	utils.notifier.notify({
		title  : error.plugin || "Error",
		message: error.message
	});
	this.emit( "end" );
}

module.exports = function ( gulp, tasks ) {
	/**
	 * Global task defaults.
	 *
	 * @type {Object}
	 */
	var defaults = Object.assign({ onError: Error }, tasks.defaults );
	delete tasks.defaults;

	/**
	 * Lazy-loaded plugins. Defaults to parsing the package.json of the current
	 * project.
	 *
	 * @type {Object}
	 */
	var plugins = getLazy( tasks.plugins || require( "./lib/plugins" ) );
	delete tasks.plugins;

	/**
	 * Build() instance bound to gulp.
	 *
	 * @type {Function}
	 */
	var build = Build.bind( gulp );

	/**
	 * Process arguments.
	 *
	 * @type {Object}
	 */
	var argv = require( "minimist" )( process.argv.slice( 2 ) );

	/**
	 * Package arguments.
	 *
	 * @type {Object}
	 */
	var pkg = Object.assign( {}, tasks.package );
	delete tasks.package;

	/**
	 * Register tasks.
	 */
	Object.keys( tasks ).forEach(function ( name ) {
		var task = Object.assign( tasks[ name ], defaults );

		gulp.task( name, function () {
			return build({
				onError: task.onError,
				pipes  : task.pipes && task.pipes.call( plugins, Object.assign( {}, argv ) ),
				files  : task.files,
				base   : task.base,
				dest   : task.dest
			});
		});
	});

	/**
	 * Clean
	 */
	gulp.task( "clean", function () {
		var paths = Object.keys( tasks ).map(function ( name ) {
			return tasks[ name ].dest;
		});

		return utils.del( paths.concat([ "_package/**" ]) );
	});

	/**
	 * Build
	 */
	gulp.task( "build", [ "clean" ], function () {
		var args = Object.assign(
			{},
			this.seq.slice( -1 )[0] === "package" ? pkg.args : {},
			argv
		);

		var srcs = Object.keys( tasks ).map( function ( name ) {
			var task = tasks[ name ];

			return build({
				onError: task.onError,
				files  : task.files,
				pipes  : task.pipes && task.pipes.call( this, args ),
				base   : task.base,
				dest   : task.dest
			});
		}, plugins );

		return utils.merge( srcs );
	});

	/**
	 * Watch
	 */
	gulp.task( "watch", [ "build" ], function () {
		var browserSync;

		try {
			browserSync = require( process.cwd() + "/browserSync.json" );
			browserSync = require( "browser-sync" ).create();
			browserSync.init( browserSync );
		} catch ( e ) {
			browserSync = null;
		}

		Object.keys( tasks ).forEach( function ( name ) {
			var task = tasks[ name ];

			gulp.watch( task.watch || task.files ).on( "change", function ( file ) {
				var filename = utils.chalk.magenta( utils.path.basename( file.path ) );
				var time     = process.hrtime();

				utils.log( "Starting", filename, "..." );

				var stream = build({
					onError: task.onError,
					files  : task.doOne ? file.path : task.files,
					pipes  : task.pipes && task.pipes.call( plugins, argv ),
					base   : task.base,
					dest   : task.dest
				});

				return stream.on( "end", function () {
					utils.log( "Finished", filename, "after", utils.chalk.magenta( utils.prettyTime( process.hrtime( time ) ) ) );

					if ( browserSync && task.sync )
						browserSync.reload( task.sync );
				});
			});
		});
	});

	/**
	 * Package
	 */
	gulp.task( "package", [ "build" ], function () {
		var files = [
			"**",
			"!.*",
			"!*.md",
			"!*.log",
			"!gulpfile.js",
			"!package.json",
			"!browserSync.json",
			"!_package{,/**}",
			"!node_modules{,/**}"
		];

		if ( Array.isArray( pkg.files ) )
			files = files.concat( pkg.files );
		else if ( pkg.files )
			files.push( pkg.files );

		return build({
			files: files,
			dest : "_package"
		});
	});

	gulp.task( "default", [ "watch" ] );

	return build;
};
