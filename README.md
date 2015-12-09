# gulp-build

Easily create gulp builds using nothing more than a configuration object.

    require( "gulp-build" )( require( "gulp" ), {
    	styles: {
    		files: "build/styles/**/*.scss",
    		pipes: function ( args ) {
    			return [
    				this.sass().on( "error", this.sass.logError )
    			];
    		}
    	}
    });
