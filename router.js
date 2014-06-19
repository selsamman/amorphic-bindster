AmorphicRouter =
{
    location: (typeof(document) != 'undefined') ? document.location : {pathname: '', search: '', hash: ''},
    history: (typeof(window) != 'undefined' && window.history ? window.history : null),
    paths: {},
    currentRoute: null,
    hasPushState: !!(typeof(window) != 'undefined' && window.history && history.pushState),
    lastParsedPath: null,

    /**
     * Set up routing
     *
     * @param controller - a Bindster controller
     * @param routeIn - a routing definitions
     * @param options - options
     */
    route: function(controller, routeIn, options)
    {
        this.controller = controller;
        options = options || {};
        var self = this;
        this._route = function () {
            self._goTo(self.route);
        }

        this._parseRoute(this._route, routeIn, {}, '', '');

        // Check regularly to see if path appears in location.href
        var self = this;
        setInterval(function () {self._checkURL()}, options.interval || 500);

        return this._route;
    },

    /**
     * Called internally when going from route to the other but may
     * be called externally from say a windows.unload event
     */
    leave: function ()
    {
        if (this.currentRoute)
            for (var ix = 0; ix < this.currentRoute.__exit.length; ++ix)
                this.currentRoute.__exit[ix].call(this.controller, this.currentRoute);
        this.currentRoute = null;
    },

    /*
    * Called internally from goTo or when a route appears in location.href
    * but may be called to enter a route without it appearing in the address
    * bar or creating history
    */
    arrive: function (route, parsed)
    {
        this.leave();
        this.currentRoute = route;
        for (var key in route.__parameters)
            if (parsed.parameters[key])
                this.controller.bindSet(route.__parameters[key].bind, parsed.parameters[key]);
        for (var ix = 0; ix < this.currentRoute.__enter.length; ++ix)
            this.currentRoute.__enter[ix].call(this.controller, this.currentRoute);
        this.controller.refresh();

    },
    /**
     * Go to a location based on a path (same invoking a route as a function admin.tickets());
     * @param path
     */
    goTo: function (path) {
        var route = this.paths[path.substr(0, 1) == '/' ? path : '/' + path];
        if (route)
            this._goTo(route);
    },
    /**
     * Set a new route as active.  The route is a leaf in the routing definition tree
     * It is called internally by each leaf's goTo function.  History is created
     * for the route and it will appear in the address bar.  It may or may not load
     * a new page depending on the load boolean in the leaf.
     * @param route
     */
    _goTo: function (route)
    {
        if (route.load)
            this.location.href = this._encodeURL(route);
        else if (this.hasPushState) {
            this.location.hash = '';
            this.history.pushState(route.__path, route.__title ? route.__title : null, this._encodeURL(route));
        } else
            this.location.hash = '#' + encodeURIComponent(this._encodeURL(route));
        this._checkURL();
    },

    /* Internal functions */

    /**
     * Split of current URL and determine if a path has been defined for it.
     * If so arrive at that path
     *
     * @private
     */
    _checkURL: function()
    {
        // Break apart URL which consists of path ? search # hash
        // into component parts of a path and individual parameters
        // both of which are first taken from the path/search and
        // then may be overridden by the hash.  This let's subsequent
        // routes for an SPA be defined through a hash even through
        // the initial one came in as a path ? search.
        var parsed = {parameters: {}};
        var hash = this.location.hash.replace(/^#/, '');
        var search = this.location.search.replace(/^\?/, '');
        if (this.location.pathname)
            parsed = this._parseURL(this.location.pathname + '?' + search);
        if (hash)
            parsed = this._parseURL(decodeURIComponent(hash), parsed);

        // Grab the route from paths extracted from routeIn and signal arrival
        var route = this.paths[parsed.path];
        if (route && this.lastParsedPath != JSON.stringify(parsed)) {
            this.lastParsedPath = JSON.stringify(parsed);
            this.arrive(route, parsed);
        }

    },

    /**
     * Parse a path?search URL into a structure, overriding previous values in
     * that structure in the structure is pased in
     *
     * @param str
     * @param parsed (optional)
     * @returns {*|{path: String, parmeters: {}}}
     * @private
     */
    _parseURL: function(str, parsed)
    {
        parsed = parsed || {parameters: {}};
        var parts = str.split('?');
        parsed.path = parts[0].substr(0, 1) == "/" ? parts[0] : '/' + parts[0];
        if (parts.length > 1) {
            var pairs = parts[1].split('&');
            for (var ix = 0; ix < pairs.length; ++ix) {
                var keyValue = pairs[ix].split('=');
                parsed.parameters[keyValue[0]] = decodeURIComponent(keyValue.length > 1 ? keyValue[1] : '');
            }
        }
        return parsed;
    },

    /**
     * Encode a URL into a search string with key=value pairs separated by & signs and starting with a ?
     *
     * @param route
     * @returns {*}
     * @private
     */
    _encodeURL: function (route)
    {
        var separator = '?';
        var url = route.__path;
        for (var key in route.__parameters) {
            if (!(route.__parameters[key].encode === false)) {
                url += separator + key + '=' + encodeURIComponent(this.controller.bindGet(route.__parameters[key].bind));
                separator = '&';
            }
        }
        return url;
    },

    /**
     * Parse a route definition leaf calling _parseRoute recursively
     *
     * @param route - A route leaf to be populated from ...
     * @param routeIn - A route leaf definition
     * @param inherited - augmented by inherited properties
     * @param currPath - and previous parts of a path
     * @param prop
     * @private
     */
    _parseRoute: function (route, routeIn, inherited, currPath, prop)
    {
        // Merge based on the path specified in leaf or the property as a path segment
        var pathSegment = typeof(routeIn.path) != 'undefined' ? routeIn.path : prop;
        currPath = pathSegment ? currPath + '/' + pathSegment : currPath;
        this.paths[(currPath ? currPath : '/')] = route;
        route.__path = currPath.substr(0,1) == '/' ? currPath : '/' + currPath;

        // Create route that has merged properties
        route.__enter = [];
        route.__exit = [];
        route.__parameters = {};
        route.__route = prop;

        // Pull in all of the array parameters from interited (which is a route type structure)
        for (var prop in {__enter: 1, __exit: 1, __parameters: 1})
            if (inherited[prop])
                for (var ix = 0; ix < inherited[prop].length; ++ix)
                    route[prop].push(inherited[prop][ix])
        if (inherited.__parameters)
            for (var param in inherited.__parameters)
                route.__parameters[param] = inherited.__parameters[param]

        // Then for the arrays layer on the one in the current leaf
        var self = this;
        if (routeIn.enter)
            route.__enter.push(function (route){routeIn.enter.call(self.controller, route)});
        if (routeIn.exit)
            route.__enter.push(function (route){routeIn.exit.call(self.controller, route)});
        if (routeIn.parameters)
            for (var param in routeIn.parameters)
                route.__parameters[param] = routeIn.parameters[param];

        // Now merge in the user defined properties
        function processProp (source) {
            for (var prop in source)
                if (!prop.match(/^enter$|^exit$|^parameters$|^routes$|^path$/))
                    route['__' + prop] = source[prop]
        }
        processProp(inherited);
        processProp(routeIn);


        // Add sub-routes

        if (routeIn.routes)
            for (var prop in routeIn.routes) {
                var self = this;
                (function () {
                    var closureProp = prop;
                    route[prop] = function () {
                        self._goTo(route[closureProp])
                    }
                })();
                this._parseRoute(route[prop], routeIn.routes[prop], route, currPath, prop)
            }
    }
}

if (typeof(module) != 'undefined')
    module.exports = AmorphicRouter;