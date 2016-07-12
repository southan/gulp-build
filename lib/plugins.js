/* jshint node: true */
"use strict";

/**
 * Get plugins object fallback from project package.json
 *
 * @returns {Object}
 */
module.exports = (function ( undefined ) {
	var plugins = {};
	var modules = {};

	try {
		modules = require( process.cwd() + "/package.json" ).devDependencies;
	} catch ( e ) {}

	Object.keys( modules ).forEach( function ( module ) {
		if (
			module === "gulp" ||
			module === "gulp-build" ||
			plugins[ module ] !== undefined && module.indexOf( "gulp-" ) !== 0 ) {
			return;
		}

		var nicename = module.replace( "gulp-", "" ).replace( /[_-]([a-z])/gi, function ( match ) {
			return match[1].toUpperCase();
		});

		plugins[ nicename ] = module;
	});

	return plugins;
})();