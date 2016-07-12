/* jshint node: true */
"use strict";

var getLazy = require( "./lib/lazy" );

/**
 * Our own little helper.
 *
 * @type {Object}
 */
var utils = getLazy({
	chalk     : "chalk",
	del       : "del",
	log       : "fancy-log",
	merge     : "merge-stream",
	minimist  : "minimist",
	notifier  : "node-notifier",
	path      : "path",
	plumber   : "gulp-plumber",
	prettyTime: "pretty-hrtime"
});

/**
 * Helper for logging timed events.
 *
 * @param {String} name - Name of file or task
 */
function Timer( name ) {
	this.name = utils.chalk.cyan( name );
}

/**
 * Start the log.
 *
 * @param {String} text - Description action for the file or task
 */
Timer.prototype.start = function ( text ) {
	this.time = process.hrtime();
	utils.log( text || "Starting", this.name, "..." );
};

/**
 * Finish the log.
 *
 * @param {String} text - Description action for the file or task
 */
Timer.prototype.finish = function ( text ) {
	utils.log( text || "Finished", this.name, "after", utils.chalk.magenta( utils.prettyTime( process.hrtime( this.time ) ) ) );
};

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
	var argv = utils.minimist( process.argv.slice( 2 ) );

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
				pipes  : task.pipes && task.pipes.call( plugins, args ),
				base   : task.base,
				dest   : task.dest
			});
		});

		return utils.merge( srcs );
	});

	/**
	 * Watch
	 */
	gulp.task( "watch", [ "build" ], function () {
		var bSyncConfig;
		var browserSync;

		try {
			bSyncConfig = require( process.cwd() + "/browserSync.json" );
			browserSync = require( "browser-sync" ).create();
			browserSync.init( bSyncConfig );
		} catch ( e ) {
			browserSync = null;
		}

		Object.keys( tasks ).forEach( function ( name ) {
			var task = tasks[ name ];

			gulp.watch( task.watch || task.files ).on( "change", function ( file ) {
				var timer = new Timer( utils.path.basename( file.path ) );

				if ( task.doOne && file.type === "deleted" ) {
					timer.start( "Deleting" );

					var base = task.base !== undefined ? utils.path.resolve( task.base ) : process.cwd();
					var dest = utils.path.resolve( task.dest, utils.path.relative( base, file.path ) );

					if ( dest ) {
						utils.del( dest ).then(function () {
							timer.finish( "Deleted" );
						});
					}

				} else {
					timer.start();

					var stream = build({
						onError: task.onError,
						files  : task.doOne ? file.path : task.files,
						pipes  : task.pipes && task.pipes.call( plugins, argv ),
						base   : task.base,
						dest   : task.dest
					});

					stream.on( "end", function () {
						timer.finish();

						if ( browserSync && task.browserSync === undefined || task.browserSync )
							browserSync.reload( task.browserSync );
					});
				}
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
