/* jshint node: true */
"use strict";

/**
 * Get a lazy-loading require object.
 *
 * @param   {Object} names
 * @returns {Object}
 */
module.exports = function ( names ) {
	var lazy = {};

	Object.keys( names ).forEach(function ( name ) {
		var module = names[ name ];

		Object.defineProperty( lazy, name, {
			configurable: true,
			enumerable: true,
			get: function () {
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
};
