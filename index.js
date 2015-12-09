"use strict";

var util = getLazy({
	del    : "del",
	merge  : "merge-stream",
	assign : "object-assign",
	util   : "gulp-util",
	plumber: "gulp-plumber",
	notify : "node-notifier"
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
function gulpBuild( args ) {
	var src = this.src( args.files, args.base ? { base: args.base } : null );

	if ( args.onError )
		src = src.pipe( util.plumber( args.onError ) );

	if ( args.pipes ) {
		args.pipes.forEach( function ( pipe ) {
			if ( pipe )
				src = src.pipe( pipe );
		});
	}

	if ( args.dest )
		src = src.pipe( this.dest( args.dest ) );

	return src;
}

/**
 * Get plugins object fallback from project package.json
 *
 * @returns object
 */
function getPlugins() {
	try {
		var plugins = {};
		var project = require( process.cwd() + "/package.json" );
		var modules = util.assign( {}, project.devDependencies, project.dependencies );

		Object.keys( modules ).forEach( function ( module ) {
			var nameProp = module.replace( /-/g, "_" );
			var namePropShort = nameProp.replace( "gulp_", "" );

			// Gulp plugins get priority e.g. "jshint" will reference gulp-jshint over jshint
			if ( typeof plugins[ namePropShort ] === "undefined" || nameProp !== namePropShort  )
				plugins[ namePropShort ] = module;
		});

		return plugins;

	} catch ( error ) {
		return {};
	}
}

/**
 * Get a modules object for lazy require.
 *
 * @param   modules
 * @returns object
 */
function getLazy( modules ) {
	var lazy = {};

	Object.keys( modules ).forEach( function ( name ) {
		var module = modules[ name ];

		Object.defineProperty( lazy, name, {
			configurable: true,
			enumerable  : true,
			get         : function () {
				var value = require( module );

				Object.defineProperty( this, name, {
					configurable: false,
					writable:     false,
					value:        value
				});

				return value;
			}
		});
	});

	return lazy;
}

/**
 * Default error callback for plumber.
 *
 * @param error
 */
function onError( error ) {
	util.notify.notify({
		title  : error.plugin || "Error",
		message: error.message
	});

	this.emit( "end" );
}

module.exports = function ( gulp, options ) {
	var browserSync;
	var build = gulpBuild.bind( gulp );
	var tasks = options.tasks || options;
	var opts  = {
		onError: options.onError || onError,
		dest   : options.dest || "public",
		base   : options.base || "build"
	};

	opts.plugins = getLazy( options.plugins || getPlugins() );
	opts.package = util.assign({
		dest : "_package",
		args : {
			minify: true
		},
		files: [
			"**",
			"!.*",
			"!*.md",
			"!*.log",
			"!gulpfile.js",
			"!package.json",
			"!browserSync.json",
			"!node_modules{,/**}",
			"!" + opts.base + "{,/**}",
			"*.htaccess"
		]
	}, options.package );

	Object.keys( tasks ).forEach( function ( name ) {
		var task = tasks[ name ];

		if ( typeof task.onError === "undefined" )
			task.onError = opts.onError;
		if ( typeof task.base === "undefined" )
			task.base = opts.base;
		if ( typeof task.dest === "undefined" )
			task.dest = opts.dest;

		gulp.task( name, function () {
			return build({
				onError: task.onError,
				pipes  : task.pipes && task.pipes.call( opts.plugins, util.assign( {}, util.util.env ) ),
				files  : task.files,
				base   : task.base,
				dest   : task.dest
			});
		});
	});

	gulp.task( "clean", function () {
		return util.del([ "_package/**", opts.dest + "/**" ]);
	});

	gulp.task( "build", [ "clean" ], function () {
		var merged = util.merge(),
			args   = util.assign( {}, this.seq.slice( -1 )[0] === "package" ? opts.package.args : {}, util.util.env );

		Object.keys( tasks ).forEach( function ( name ) {
			var task = tasks[ name ];

			merged.add(
				build({
					onError: task.onError,
					files  : task.files,
					pipes  : task.pipes && task.pipes.call( opts.plugins, args ),
					base   : task.base,
					dest   : task.dest
				})
			);
		});

		return merged;
	});

	gulp.task( "watch", function () {
		Object.keys( tasks ).forEach( function ( name ) {
			var task = tasks[ name ];

			gulp.watch( task.watch || task.files ).on( "change", function ( file ) {
				var stream = build({
					onError: task.onError,
					files  : task.merge ? task.files : file.path,
					pipes  : task.pipes && task.pipes.call( opts.plugins, util.util.env ),
					base   : task.base,
					dest   : task.dest
				});

				return stream.on( "end", function () {
					util.util.log( "Finished", util.util.colors.magenta( name ) );

					if ( browserSync && task.sync )
						browserSync.reload( task.sync );
				});
			});
		});
	});

	gulp.task( "package", [ "build" ], function () {
		return build( opts.package );
	});

	gulp.task( "browserSync", function () {
		try {
			var config = require( process.cwd() + "/browserSync.json" );
		} catch ( error ) {
			return;
		}

		browserSync = require( "browser-sync" ).create();
		browserSync.init( config );
	});

	gulp.task( "default", [
		"build",
		"watch",
		"browserSync"
	]);

	return build;
};
