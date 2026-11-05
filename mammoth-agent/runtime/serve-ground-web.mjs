import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { chown, mkdir } from "node:fs/promises";
import os, { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import process$1 from "node:process";
import tty from "node:tty";
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var __toCommonJS = (mod) => __hasOwnProp.call(mod, "module.exports") ? mod["module.exports"] : __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __require = /* @__PURE__ */ createRequire(import.meta.url);
//#endregion
//#region node_modules/.pnpm/eventemitter3@4.0.7/node_modules/eventemitter3/index.js
var require_eventemitter3 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var has = Object.prototype.hasOwnProperty, prefix = "~";
	/**
	* Constructor to create a storage for our `EE` objects.
	* An `Events` instance is a plain object whose properties are event names.
	*
	* @constructor
	* @private
	*/
	function Events() {}
	if (Object.create) {
		Events.prototype = Object.create(null);
		if (!new Events().__proto__) prefix = false;
	}
	/**
	* Representation of a single event listener.
	*
	* @param {Function} fn The listener function.
	* @param {*} context The context to invoke the listener with.
	* @param {Boolean} [once=false] Specify if the listener is a one-time listener.
	* @constructor
	* @private
	*/
	function EE(fn, context, once) {
		this.fn = fn;
		this.context = context;
		this.once = once || false;
	}
	/**
	* Add a listener for a given event.
	*
	* @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
	* @param {(String|Symbol)} event The event name.
	* @param {Function} fn The listener function.
	* @param {*} context The context to invoke the listener with.
	* @param {Boolean} once Specify if the listener is a one-time listener.
	* @returns {EventEmitter}
	* @private
	*/
	function addListener(emitter, event, fn, context, once) {
		if (typeof fn !== "function") throw new TypeError("The listener must be a function");
		var listener = new EE(fn, context || emitter, once), evt = prefix ? prefix + event : event;
		if (!emitter._events[evt]) emitter._events[evt] = listener, emitter._eventsCount++;
		else if (!emitter._events[evt].fn) emitter._events[evt].push(listener);
		else emitter._events[evt] = [emitter._events[evt], listener];
		return emitter;
	}
	/**
	* Clear event by name.
	*
	* @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
	* @param {(String|Symbol)} evt The Event name.
	* @private
	*/
	function clearEvent(emitter, evt) {
		if (--emitter._eventsCount === 0) emitter._events = new Events();
		else delete emitter._events[evt];
	}
	/**
	* Minimal `EventEmitter` interface that is molded against the Node.js
	* `EventEmitter` interface.
	*
	* @constructor
	* @public
	*/
	function EventEmitter() {
		this._events = new Events();
		this._eventsCount = 0;
	}
	/**
	* Return an array listing the events for which the emitter has registered
	* listeners.
	*
	* @returns {Array}
	* @public
	*/
	EventEmitter.prototype.eventNames = function eventNames() {
		var names = [], events, name;
		if (this._eventsCount === 0) return names;
		for (name in events = this._events) if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
		if (Object.getOwnPropertySymbols) return names.concat(Object.getOwnPropertySymbols(events));
		return names;
	};
	/**
	* Return the listeners registered for a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @returns {Array} The registered listeners.
	* @public
	*/
	EventEmitter.prototype.listeners = function listeners(event) {
		var evt = prefix ? prefix + event : event, handlers = this._events[evt];
		if (!handlers) return [];
		if (handlers.fn) return [handlers.fn];
		for (var i = 0, l = handlers.length, ee = new Array(l); i < l; i++) ee[i] = handlers[i].fn;
		return ee;
	};
	/**
	* Return the number of listeners listening to a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @returns {Number} The number of listeners.
	* @public
	*/
	EventEmitter.prototype.listenerCount = function listenerCount(event) {
		var evt = prefix ? prefix + event : event, listeners = this._events[evt];
		if (!listeners) return 0;
		if (listeners.fn) return 1;
		return listeners.length;
	};
	/**
	* Calls each of the listeners registered for a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @returns {Boolean} `true` if the event had listeners, else `false`.
	* @public
	*/
	EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
		var evt = prefix ? prefix + event : event;
		if (!this._events[evt]) return false;
		var listeners = this._events[evt], len = arguments.length, args, i;
		if (listeners.fn) {
			if (listeners.once) this.removeListener(event, listeners.fn, void 0, true);
			switch (len) {
				case 1: return listeners.fn.call(listeners.context), true;
				case 2: return listeners.fn.call(listeners.context, a1), true;
				case 3: return listeners.fn.call(listeners.context, a1, a2), true;
				case 4: return listeners.fn.call(listeners.context, a1, a2, a3), true;
				case 5: return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
				case 6: return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
			}
			for (i = 1, args = new Array(len - 1); i < len; i++) args[i - 1] = arguments[i];
			listeners.fn.apply(listeners.context, args);
		} else {
			var length = listeners.length, j;
			for (i = 0; i < length; i++) {
				if (listeners[i].once) this.removeListener(event, listeners[i].fn, void 0, true);
				switch (len) {
					case 1:
						listeners[i].fn.call(listeners[i].context);
						break;
					case 2:
						listeners[i].fn.call(listeners[i].context, a1);
						break;
					case 3:
						listeners[i].fn.call(listeners[i].context, a1, a2);
						break;
					case 4:
						listeners[i].fn.call(listeners[i].context, a1, a2, a3);
						break;
					default:
						if (!args) for (j = 1, args = new Array(len - 1); j < len; j++) args[j - 1] = arguments[j];
						listeners[i].fn.apply(listeners[i].context, args);
				}
			}
		}
		return true;
	};
	/**
	* Add a listener for a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @param {Function} fn The listener function.
	* @param {*} [context=this] The context to invoke the listener with.
	* @returns {EventEmitter} `this`.
	* @public
	*/
	EventEmitter.prototype.on = function on(event, fn, context) {
		return addListener(this, event, fn, context, false);
	};
	/**
	* Add a one-time listener for a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @param {Function} fn The listener function.
	* @param {*} [context=this] The context to invoke the listener with.
	* @returns {EventEmitter} `this`.
	* @public
	*/
	EventEmitter.prototype.once = function once(event, fn, context) {
		return addListener(this, event, fn, context, true);
	};
	/**
	* Remove the listeners of a given event.
	*
	* @param {(String|Symbol)} event The event name.
	* @param {Function} fn Only remove the listeners that match this function.
	* @param {*} context Only remove the listeners that have this context.
	* @param {Boolean} once Only remove one-time listeners.
	* @returns {EventEmitter} `this`.
	* @public
	*/
	EventEmitter.prototype.removeListener = function removeListener(event, fn, context, once) {
		var evt = prefix ? prefix + event : event;
		if (!this._events[evt]) return this;
		if (!fn) {
			clearEvent(this, evt);
			return this;
		}
		var listeners = this._events[evt];
		if (listeners.fn) {
			if (listeners.fn === fn && (!once || listeners.once) && (!context || listeners.context === context)) clearEvent(this, evt);
		} else {
			for (var i = 0, events = [], length = listeners.length; i < length; i++) if (listeners[i].fn !== fn || once && !listeners[i].once || context && listeners[i].context !== context) events.push(listeners[i]);
			if (events.length) this._events[evt] = events.length === 1 ? events[0] : events;
			else clearEvent(this, evt);
		}
		return this;
	};
	/**
	* Remove all listeners, or those of the specified event.
	*
	* @param {(String|Symbol)} [event] The event name.
	* @returns {EventEmitter} `this`.
	* @public
	*/
	EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
		var evt;
		if (event) {
			evt = prefix ? prefix + event : event;
			if (this._events[evt]) clearEvent(this, evt);
		} else {
			this._events = new Events();
			this._eventsCount = 0;
		}
		return this;
	};
	EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
	EventEmitter.prototype.addListener = EventEmitter.prototype.on;
	EventEmitter.prefixed = prefix;
	EventEmitter.EventEmitter = EventEmitter;
	if ("undefined" !== typeof module) module.exports = EventEmitter;
}));
//#endregion
//#region node_modules/.pnpm/requires-port@1.0.0/node_modules/requires-port/index.js
var require_requires_port = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* Check if we're required to add a port number.
	*
	* @see https://url.spec.whatwg.org/#default-port
	* @param {Number|String} port Port number we need to check
	* @param {String} protocol Protocol we need to check against.
	* @returns {Boolean} Is it a default port for the given protocol
	* @api private
	*/
	module.exports = function required(port, protocol) {
		protocol = protocol.split(":")[0];
		port = +port;
		if (!port) return false;
		switch (protocol) {
			case "http":
			case "ws": return port !== 80;
			case "https":
			case "wss": return port !== 443;
			case "ftp": return port !== 21;
			case "gopher": return port !== 70;
			case "file": return false;
		}
		return port !== 0;
	};
}));
//#endregion
//#region node_modules/.pnpm/http-proxy@1.18.1_debug@4.4.3_supports-color@9.4.0_/node_modules/http-proxy/lib/http-proxy/common.js
var require_common$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var common$3 = exports, url$2 = __require("url"), extend$1 = __require("util")._extend, required = require_requires_port();
	var upgradeHeader = /(^|,)\s*upgrade\s*($|,)/i, isSSL = /^https|wss/;
	/**
	* Simple Regex for testing if protocol is https
	*/
	common$3.isSSL = isSSL;
	/**
	* Copies the right headers from `options` and `req` to
	* `outgoing` which is then used to fire the proxied
	* request.
	*
	* Examples:
	*
	*    common.setupOutgoing(outgoing, options, req)
	*    // => { host: ..., hostname: ...}
	*
	* @param {Object} Outgoing Base object to be filled with required properties
	* @param {Object} Options Config object passed to the proxy
	* @param {ClientRequest} Req Request Object
	* @param {String} Forward String to select forward or target
	* 
	* @return {Object} Outgoing Object with all required properties set
	*
	* @api private
	*/
	common$3.setupOutgoing = function(outgoing, options, req, forward) {
		outgoing.port = options[forward || "target"].port || (isSSL.test(options[forward || "target"].protocol) ? 443 : 80);
		[
			"host",
			"hostname",
			"socketPath",
			"pfx",
			"key",
			"passphrase",
			"cert",
			"ca",
			"ciphers",
			"secureProtocol"
		].forEach(function(e) {
			outgoing[e] = options[forward || "target"][e];
		});
		outgoing.method = options.method || req.method;
		outgoing.headers = extend$1({}, req.headers);
		if (options.headers) extend$1(outgoing.headers, options.headers);
		if (options.auth) outgoing.auth = options.auth;
		if (options.ca) outgoing.ca = options.ca;
		if (isSSL.test(options[forward || "target"].protocol)) outgoing.rejectUnauthorized = typeof options.secure === "undefined" ? true : options.secure;
		outgoing.agent = options.agent || false;
		outgoing.localAddress = options.localAddress;
		if (!outgoing.agent) {
			outgoing.headers = outgoing.headers || {};
			if (typeof outgoing.headers.connection !== "string" || !upgradeHeader.test(outgoing.headers.connection)) outgoing.headers.connection = "close";
		}
		var target = options[forward || "target"];
		var targetPath = target && options.prependPath !== false ? target.path || "" : "";
		var outgoingPath = !options.toProxy ? url$2.parse(req.url).path || "" : req.url;
		outgoingPath = !options.ignorePath ? outgoingPath : "";
		outgoing.path = common$3.urlJoin(targetPath, outgoingPath);
		if (options.changeOrigin) outgoing.headers.host = required(outgoing.port, options[forward || "target"].protocol) && !hasPort(outgoing.host) ? outgoing.host + ":" + outgoing.port : outgoing.host;
		return outgoing;
	};
	/**
	* Set the proper configuration for sockets,
	* set no delay and set keep alive, also set
	* the timeout to 0.
	*
	* Examples:
	*
	*    common.setupSocket(socket)
	*    // => Socket
	*
	* @param {Socket} Socket instance to setup
	* 
	* @return {Socket} Return the configured socket.
	*
	* @api private
	*/
	common$3.setupSocket = function(socket) {
		socket.setTimeout(0);
		socket.setNoDelay(true);
		socket.setKeepAlive(true, 0);
		return socket;
	};
	/**
	* Get the port number from the host. Or guess it based on the connection type.
	*
	* @param {Request} req Incoming HTTP request.
	*
	* @return {String} The port number.
	*
	* @api private
	*/
	common$3.getPort = function(req) {
		var res = req.headers.host ? req.headers.host.match(/:(\d+)/) : "";
		return res ? res[1] : common$3.hasEncryptedConnection(req) ? "443" : "80";
	};
	/**
	* Check if the request has an encrypted connection.
	*
	* @param {Request} req Incoming HTTP request.
	*
	* @return {Boolean} Whether the connection is encrypted or not.
	*
	* @api private
	*/
	common$3.hasEncryptedConnection = function(req) {
		return Boolean(req.connection.encrypted || req.connection.pair);
	};
	/**
	* OS-agnostic join (doesn't break on URLs like path.join does on Windows)>
	*
	* @return {String} The generated path.
	*
	* @api private
	*/
	common$3.urlJoin = function() {
		var args = Array.prototype.slice.call(arguments), lastIndex = args.length - 1, lastSegs = args[lastIndex].split("?"), retSegs;
		args[lastIndex] = lastSegs.shift();
		retSegs = [args.filter(Boolean).join("/").replace(/\/+/g, "/").replace("http:/", "http://").replace("https:/", "https://")];
		retSegs.push.apply(retSegs, lastSegs);
		return retSegs.join("?");
	};
	/**
	* Rewrites or removes the domain of a cookie header
	*
	* @param {String|Array} Header
	* @param {Object} Config, mapping of domain to rewritten domain.
	*                 '*' key to match any domain, null value to remove the domain.
	*
	* @api private
	*/
	common$3.rewriteCookieProperty = function rewriteCookieProperty(header, config, property) {
		if (Array.isArray(header)) return header.map(function(headerElement) {
			return rewriteCookieProperty(headerElement, config, property);
		});
		return header.replace(new RegExp("(;\\s*" + property + "=)([^;]+)", "i"), function(match, prefix, previousValue) {
			var newValue;
			if (previousValue in config) newValue = config[previousValue];
			else if ("*" in config) newValue = config["*"];
			else return match;
			if (newValue) return prefix + newValue;
			else return "";
		});
	};
	/**
	* Check the host and see if it potentially has a port in it (keep it simple)
	*
	* @returns {Boolean} Whether we have one or not
	*
	* @api private
	*/
	function hasPort(host) {
		return !!~host.indexOf(":");
	}
}));
//#endregion
//#region node_modules/.pnpm/http-proxy@1.18.1_debug@4.4.3_supports-color@9.4.0_/node_modules/http-proxy/lib/http-proxy/passes/web-outgoing.js
var require_web_outgoing = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var url$1 = __require("url"), common$2 = require_common$1();
	var redirectRegex = /^201|30(1|2|7|8)$/;
	/*!
	* Array of passes.
	*
	* A `pass` is just a function that is executed on `req, res, options`
	* so that you can easily add new checks while still keeping the base
	* flexible.
	*/
	module.exports = {
		/**
		* If is a HTTP 1.0 request, remove chunk headers
		*
		* @param {ClientRequest} Req Request object
		* @param {IncomingMessage} Res Response object
		* @param {proxyResponse} Res Response object from the proxy request
		*
		* @api private
		*/
		removeChunked: function removeChunked(req, res, proxyRes) {
			if (req.httpVersion === "1.0") delete proxyRes.headers["transfer-encoding"];
		},
		/**
		* If is a HTTP 1.0 request, set the correct connection header
		* or if connection header not present, then use `keep-alive`
		*
		* @param {ClientRequest} Req Request object
		* @param {IncomingMessage} Res Response object
		* @param {proxyResponse} Res Response object from the proxy request
		*
		* @api private
		*/
		setConnection: function setConnection(req, res, proxyRes) {
			if (req.httpVersion === "1.0") proxyRes.headers.connection = req.headers.connection || "close";
			else if (req.httpVersion !== "2.0" && !proxyRes.headers.connection) proxyRes.headers.connection = req.headers.connection || "keep-alive";
		},
		setRedirectHostRewrite: function setRedirectHostRewrite(req, res, proxyRes, options) {
			if ((options.hostRewrite || options.autoRewrite || options.protocolRewrite) && proxyRes.headers["location"] && redirectRegex.test(proxyRes.statusCode)) {
				var target = url$1.parse(options.target);
				var u = url$1.parse(proxyRes.headers["location"]);
				if (target.host != u.host) return;
				if (options.hostRewrite) u.host = options.hostRewrite;
				else if (options.autoRewrite) u.host = req.headers["host"];
				if (options.protocolRewrite) u.protocol = options.protocolRewrite;
				proxyRes.headers["location"] = u.format();
			}
		},
		/**
		* Copy headers from proxyResponse to response
		* set each header in response object.
		*
		* @param {ClientRequest} Req Request object
		* @param {IncomingMessage} Res Response object
		* @param {proxyResponse} Res Response object from the proxy request
		* @param {Object} Options options.cookieDomainRewrite: Config to rewrite cookie domain
		*
		* @api private
		*/
		writeHeaders: function writeHeaders(req, res, proxyRes, options) {
			var rewriteCookieDomainConfig = options.cookieDomainRewrite, rewriteCookiePathConfig = options.cookiePathRewrite, preserveHeaderKeyCase = options.preserveHeaderKeyCase, rawHeaderKeyMap, setHeader = function(key, header) {
				if (header == void 0) return;
				if (rewriteCookieDomainConfig && key.toLowerCase() === "set-cookie") header = common$2.rewriteCookieProperty(header, rewriteCookieDomainConfig, "domain");
				if (rewriteCookiePathConfig && key.toLowerCase() === "set-cookie") header = common$2.rewriteCookieProperty(header, rewriteCookiePathConfig, "path");
				res.setHeader(String(key).trim(), header);
			};
			if (typeof rewriteCookieDomainConfig === "string") rewriteCookieDomainConfig = { "*": rewriteCookieDomainConfig };
			if (typeof rewriteCookiePathConfig === "string") rewriteCookiePathConfig = { "*": rewriteCookiePathConfig };
			if (preserveHeaderKeyCase && proxyRes.rawHeaders != void 0) {
				rawHeaderKeyMap = {};
				for (var i = 0; i < proxyRes.rawHeaders.length; i += 2) {
					var key = proxyRes.rawHeaders[i];
					rawHeaderKeyMap[key.toLowerCase()] = key;
				}
			}
			Object.keys(proxyRes.headers).forEach(function(key) {
				var header = proxyRes.headers[key];
				if (preserveHeaderKeyCase && rawHeaderKeyMap) key = rawHeaderKeyMap[key] || key;
				setHeader(key, header);
			});
		},
		/**
		* Set the statusCode from the proxyResponse
		*
		* @param {ClientRequest} Req Request object
		* @param {IncomingMessage} Res Response object
		* @param {proxyResponse} Res Response object from the proxy request
		*
		* @api private
		*/
		writeStatusCode: function writeStatusCode(req, res, proxyRes) {
			if (proxyRes.statusMessage) {
				res.statusCode = proxyRes.statusCode;
				res.statusMessage = proxyRes.statusMessage;
			} else res.statusCode = proxyRes.statusCode;
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/ms@2.1.3/node_modules/ms/index.js
var require_ms = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* Helpers.
	*/
	var s = 1e3;
	var m = s * 60;
	var h = m * 60;
	var d = h * 24;
	var w = d * 7;
	var y = d * 365.25;
	/**
	* Parse or format the given `val`.
	*
	* Options:
	*
	*  - `long` verbose formatting [false]
	*
	* @param {String|Number} val
	* @param {Object} [options]
	* @throws {Error} throw an error if val is not a non-empty string or a number
	* @return {String|Number}
	* @api public
	*/
	module.exports = function(val, options) {
		options = options || {};
		var type = typeof val;
		if (type === "string" && val.length > 0) return parse(val);
		else if (type === "number" && isFinite(val)) return options.long ? fmtLong(val) : fmtShort(val);
		throw new Error("val is not a non-empty string or a valid number. val=" + JSON.stringify(val));
	};
	/**
	* Parse the given `str` and return milliseconds.
	*
	* @param {String} str
	* @return {Number}
	* @api private
	*/
	function parse(str) {
		str = String(str);
		if (str.length > 100) return;
		var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(str);
		if (!match) return;
		var n = parseFloat(match[1]);
		switch ((match[2] || "ms").toLowerCase()) {
			case "years":
			case "year":
			case "yrs":
			case "yr":
			case "y": return n * y;
			case "weeks":
			case "week":
			case "w": return n * w;
			case "days":
			case "day":
			case "d": return n * d;
			case "hours":
			case "hour":
			case "hrs":
			case "hr":
			case "h": return n * h;
			case "minutes":
			case "minute":
			case "mins":
			case "min":
			case "m": return n * m;
			case "seconds":
			case "second":
			case "secs":
			case "sec":
			case "s": return n * s;
			case "milliseconds":
			case "millisecond":
			case "msecs":
			case "msec":
			case "ms": return n;
			default: return;
		}
	}
	/**
	* Short format for `ms`.
	*
	* @param {Number} ms
	* @return {String}
	* @api private
	*/
	function fmtShort(ms) {
		var msAbs = Math.abs(ms);
		if (msAbs >= d) return Math.round(ms / d) + "d";
		if (msAbs >= h) return Math.round(ms / h) + "h";
		if (msAbs >= m) return Math.round(ms / m) + "m";
		if (msAbs >= s) return Math.round(ms / s) + "s";
		return ms + "ms";
	}
	/**
	* Long format for `ms`.
	*
	* @param {Number} ms
	* @return {String}
	* @api private
	*/
	function fmtLong(ms) {
		var msAbs = Math.abs(ms);
		if (msAbs >= d) return plural(ms, msAbs, d, "day");
		if (msAbs >= h) return plural(ms, msAbs, h, "hour");
		if (msAbs >= m) return plural(ms, msAbs, m, "minute");
		if (msAbs >= s) return plural(ms, msAbs, s, "second");
		return ms + " ms";
	}
	/**
	* Pluralization helper.
	*/
	function plural(ms, msAbs, n, name) {
		var isPlural = msAbs >= n * 1.5;
		return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
	}
}));
//#endregion
//#region node_modules/.pnpm/debug@4.4.3_supports-color@9.4.0/node_modules/debug/src/common.js
var require_common = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* This is the common logic for both the Node.js and web browser
	* implementations of `debug()`.
	*/
	function setup(env) {
		createDebug.debug = createDebug;
		createDebug.default = createDebug;
		createDebug.coerce = coerce;
		createDebug.disable = disable;
		createDebug.enable = enable;
		createDebug.enabled = enabled;
		createDebug.humanize = require_ms();
		createDebug.destroy = destroy;
		Object.keys(env).forEach((key) => {
			createDebug[key] = env[key];
		});
		/**
		* The currently active debug mode names, and names to skip.
		*/
		createDebug.names = [];
		createDebug.skips = [];
		/**
		* Map of special "%n" handling functions, for the debug "format" argument.
		*
		* Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
		*/
		createDebug.formatters = {};
		/**
		* Selects a color for a debug namespace
		* @param {String} namespace The namespace string for the debug instance to be colored
		* @return {Number|String} An ANSI color code for the given namespace
		* @api private
		*/
		function selectColor(namespace) {
			let hash = 0;
			for (let i = 0; i < namespace.length; i++) {
				hash = (hash << 5) - hash + namespace.charCodeAt(i);
				hash |= 0;
			}
			return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
		}
		createDebug.selectColor = selectColor;
		/**
		* Create a debugger with the given `namespace`.
		*
		* @param {String} namespace
		* @return {Function}
		* @api public
		*/
		function createDebug(namespace) {
			let prevTime;
			let enableOverride = null;
			let namespacesCache;
			let enabledCache;
			function debug(...args) {
				if (!debug.enabled) return;
				const self = debug;
				const curr = Number(/* @__PURE__ */ new Date());
				self.diff = curr - (prevTime || curr);
				self.prev = prevTime;
				self.curr = curr;
				prevTime = curr;
				args[0] = createDebug.coerce(args[0]);
				if (typeof args[0] !== "string") args.unshift("%O");
				let index = 0;
				args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
					if (match === "%%") return "%";
					index++;
					const formatter = createDebug.formatters[format];
					if (typeof formatter === "function") {
						const val = args[index];
						match = formatter.call(self, val);
						args.splice(index, 1);
						index--;
					}
					return match;
				});
				createDebug.formatArgs.call(self, args);
				(self.log || createDebug.log).apply(self, args);
			}
			debug.namespace = namespace;
			debug.useColors = createDebug.useColors();
			debug.color = createDebug.selectColor(namespace);
			debug.extend = extend;
			debug.destroy = createDebug.destroy;
			Object.defineProperty(debug, "enabled", {
				enumerable: true,
				configurable: false,
				get: () => {
					if (enableOverride !== null) return enableOverride;
					if (namespacesCache !== createDebug.namespaces) {
						namespacesCache = createDebug.namespaces;
						enabledCache = createDebug.enabled(namespace);
					}
					return enabledCache;
				},
				set: (v) => {
					enableOverride = v;
				}
			});
			if (typeof createDebug.init === "function") createDebug.init(debug);
			return debug;
		}
		function extend(namespace, delimiter) {
			const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
			newDebug.log = this.log;
			return newDebug;
		}
		/**
		* Enables a debug mode by namespaces. This can include modes
		* separated by a colon and wildcards.
		*
		* @param {String} namespaces
		* @api public
		*/
		function enable(namespaces) {
			createDebug.save(namespaces);
			createDebug.namespaces = namespaces;
			createDebug.names = [];
			createDebug.skips = [];
			const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
			for (const ns of split) if (ns[0] === "-") createDebug.skips.push(ns.slice(1));
			else createDebug.names.push(ns);
		}
		/**
		* Checks if the given string matches a namespace template, honoring
		* asterisks as wildcards.
		*
		* @param {String} search
		* @param {String} template
		* @return {Boolean}
		*/
		function matchesTemplate(search, template) {
			let searchIndex = 0;
			let templateIndex = 0;
			let starIndex = -1;
			let matchIndex = 0;
			while (searchIndex < search.length) if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) if (template[templateIndex] === "*") {
				starIndex = templateIndex;
				matchIndex = searchIndex;
				templateIndex++;
			} else {
				searchIndex++;
				templateIndex++;
			}
			else if (starIndex !== -1) {
				templateIndex = starIndex + 1;
				matchIndex++;
				searchIndex = matchIndex;
			} else return false;
			while (templateIndex < template.length && template[templateIndex] === "*") templateIndex++;
			return templateIndex === template.length;
		}
		/**
		* Disable debug output.
		*
		* @return {String} namespaces
		* @api public
		*/
		function disable() {
			const namespaces = [...createDebug.names, ...createDebug.skips.map((namespace) => "-" + namespace)].join(",");
			createDebug.enable("");
			return namespaces;
		}
		/**
		* Returns true if the given mode name is enabled, false otherwise.
		*
		* @param {String} name
		* @return {Boolean}
		* @api public
		*/
		function enabled(name) {
			for (const skip of createDebug.skips) if (matchesTemplate(name, skip)) return false;
			for (const ns of createDebug.names) if (matchesTemplate(name, ns)) return true;
			return false;
		}
		/**
		* Coerce `val`.
		*
		* @param {Mixed} val
		* @return {Mixed}
		* @api private
		*/
		function coerce(val) {
			if (val instanceof Error) return val.stack || val.message;
			return val;
		}
		/**
		* XXX DO NOT USE. This is a temporary stub function.
		* XXX It WILL be removed in the next major release.
		*/
		function destroy() {
			console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
		}
		createDebug.enable(createDebug.load());
		return createDebug;
	}
	module.exports = setup;
}));
//#endregion
//#region node_modules/.pnpm/debug@4.4.3_supports-color@9.4.0/node_modules/debug/src/browser.js
var require_browser = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* This is the web browser implementation of `debug()`.
	*/
	exports.formatArgs = formatArgs;
	exports.save = save;
	exports.load = load;
	exports.useColors = useColors;
	exports.storage = localstorage();
	exports.destroy = (() => {
		let warned = false;
		return () => {
			if (!warned) {
				warned = true;
				console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
			}
		};
	})();
	/**
	* Colors.
	*/
	exports.colors = [
		"#0000CC",
		"#0000FF",
		"#0033CC",
		"#0033FF",
		"#0066CC",
		"#0066FF",
		"#0099CC",
		"#0099FF",
		"#00CC00",
		"#00CC33",
		"#00CC66",
		"#00CC99",
		"#00CCCC",
		"#00CCFF",
		"#3300CC",
		"#3300FF",
		"#3333CC",
		"#3333FF",
		"#3366CC",
		"#3366FF",
		"#3399CC",
		"#3399FF",
		"#33CC00",
		"#33CC33",
		"#33CC66",
		"#33CC99",
		"#33CCCC",
		"#33CCFF",
		"#6600CC",
		"#6600FF",
		"#6633CC",
		"#6633FF",
		"#66CC00",
		"#66CC33",
		"#9900CC",
		"#9900FF",
		"#9933CC",
		"#9933FF",
		"#99CC00",
		"#99CC33",
		"#CC0000",
		"#CC0033",
		"#CC0066",
		"#CC0099",
		"#CC00CC",
		"#CC00FF",
		"#CC3300",
		"#CC3333",
		"#CC3366",
		"#CC3399",
		"#CC33CC",
		"#CC33FF",
		"#CC6600",
		"#CC6633",
		"#CC9900",
		"#CC9933",
		"#CCCC00",
		"#CCCC33",
		"#FF0000",
		"#FF0033",
		"#FF0066",
		"#FF0099",
		"#FF00CC",
		"#FF00FF",
		"#FF3300",
		"#FF3333",
		"#FF3366",
		"#FF3399",
		"#FF33CC",
		"#FF33FF",
		"#FF6600",
		"#FF6633",
		"#FF9900",
		"#FF9933",
		"#FFCC00",
		"#FFCC33"
	];
	/**
	* Currently only WebKit-based Web Inspectors, Firefox >= v31,
	* and the Firebug extension (any Firefox version) are known
	* to support "%c" CSS customizations.
	*
	* TODO: add a `localStorage` variable to explicitly enable/disable colors
	*/
	function useColors() {
		if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) return true;
		if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) return false;
		let m;
		return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
	}
	/**
	* Colorize log arguments if enabled.
	*
	* @api public
	*/
	function formatArgs(args) {
		args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
		if (!this.useColors) return;
		const c = "color: " + this.color;
		args.splice(1, 0, c, "color: inherit");
		let index = 0;
		let lastC = 0;
		args[0].replace(/%[a-zA-Z%]/g, (match) => {
			if (match === "%%") return;
			index++;
			if (match === "%c") lastC = index;
		});
		args.splice(lastC, 0, c);
	}
	/**
	* Invokes `console.debug()` when available.
	* No-op when `console.debug` is not a "function".
	* If `console.debug` is not available, falls back
	* to `console.log`.
	*
	* @api public
	*/
	exports.log = console.debug || console.log || (() => {});
	/**
	* Save `namespaces`.
	*
	* @param {String} namespaces
	* @api private
	*/
	function save(namespaces) {
		try {
			if (namespaces) exports.storage.setItem("debug", namespaces);
			else exports.storage.removeItem("debug");
		} catch (error) {}
	}
	/**
	* Load `namespaces`.
	*
	* @return {String} returns the previously persisted debug modes
	* @api private
	*/
	function load() {
		let r;
		try {
			r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
		} catch (error) {}
		if (!r && typeof process !== "undefined" && "env" in process) r = process.env.DEBUG;
		return r;
	}
	/**
	* Localstorage attempts to return the localstorage.
	*
	* This is necessary because safari throws
	* when a user disables cookies/localstorage
	* and you attempt to access it.
	*
	* @return {LocalStorage}
	* @api private
	*/
	function localstorage() {
		try {
			return localStorage;
		} catch (error) {}
	}
	module.exports = require_common()(exports);
	const { formatters } = module.exports;
	/**
	* Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
	*/
	formatters.j = function(v) {
		try {
			return JSON.stringify(v);
		} catch (error) {
			return "[UnexpectedJSONParseError]: " + error.message;
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/supports-color@9.4.0/node_modules/supports-color/index.js
var supports_color_exports = /* @__PURE__ */ __exportAll({
	createSupportsColor: () => createSupportsColor,
	default: () => supportsColor
});
function hasFlag(flag, argv = globalThis.Deno ? globalThis.Deno.args : process$1.argv) {
	const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
	const position = argv.indexOf(prefix + flag);
	const terminatorPosition = argv.indexOf("--");
	return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}
function envForceColor() {
	if ("FORCE_COLOR" in env) {
		if (env.FORCE_COLOR === "true") return 1;
		if (env.FORCE_COLOR === "false") return 0;
		return env.FORCE_COLOR.length === 0 ? 1 : Math.min(Number.parseInt(env.FORCE_COLOR, 10), 3);
	}
}
function translateLevel(level) {
	if (level === 0) return false;
	return {
		level,
		hasBasic: true,
		has256: level >= 2,
		has16m: level >= 3
	};
}
function _supportsColor(haveStream, { streamIsTTY, sniffFlags = true } = {}) {
	const noFlagForceColor = envForceColor();
	if (noFlagForceColor !== void 0) flagForceColor = noFlagForceColor;
	const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;
	if (forceColor === 0) return 0;
	if (sniffFlags) {
		if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) return 3;
		if (hasFlag("color=256")) return 2;
	}
	if ("TF_BUILD" in env && "AGENT_NAME" in env) return 1;
	if (haveStream && !streamIsTTY && forceColor === void 0) return 0;
	const min = forceColor || 0;
	if (env.TERM === "dumb") return min;
	if (process$1.platform === "win32") {
		const osRelease = os.release().split(".");
		if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) return Number(osRelease[2]) >= 14931 ? 3 : 2;
		return 1;
	}
	if ("CI" in env) {
		if ("GITHUB_ACTIONS" in env || "GITEA_ACTIONS" in env) return 3;
		if ([
			"TRAVIS",
			"CIRCLECI",
			"APPVEYOR",
			"GITLAB_CI",
			"BUILDKITE",
			"DRONE"
		].some((sign) => sign in env) || env.CI_NAME === "codeship") return 1;
		return min;
	}
	if ("TEAMCITY_VERSION" in env) return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
	if (env.COLORTERM === "truecolor") return 3;
	if (env.TERM === "xterm-kitty") return 3;
	if ("TERM_PROGRAM" in env) {
		const version = Number.parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
		switch (env.TERM_PROGRAM) {
			case "iTerm.app": return version >= 3 ? 3 : 2;
			case "Apple_Terminal": return 2;
		}
	}
	if (/-256(color)?$/i.test(env.TERM)) return 2;
	if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) return 1;
	if ("COLORTERM" in env) return 1;
	return min;
}
function createSupportsColor(stream, options = {}) {
	return translateLevel(_supportsColor(stream, {
		streamIsTTY: stream && stream.isTTY,
		...options
	}));
}
var env, flagForceColor, supportsColor;
var init_supports_color = __esmMin((() => {
	({env} = process$1);
	if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) flagForceColor = 0;
	else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) flagForceColor = 1;
	supportsColor = {
		stdout: createSupportsColor({ isTTY: tty.isatty(1) }),
		stderr: createSupportsColor({ isTTY: tty.isatty(2) })
	};
}));
//#endregion
//#region node_modules/.pnpm/debug@4.4.3_supports-color@9.4.0/node_modules/debug/src/node.js
var require_node = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* Module dependencies.
	*/
	const tty$1 = __require("tty");
	const util = __require("util");
	/**
	* This is the Node.js implementation of `debug()`.
	*/
	exports.init = init;
	exports.log = log;
	exports.formatArgs = formatArgs;
	exports.save = save;
	exports.load = load;
	exports.useColors = useColors;
	exports.destroy = util.deprecate(() => {}, "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
	/**
	* Colors.
	*/
	exports.colors = [
		6,
		2,
		3,
		4,
		5,
		1
	];
	try {
		const supportsColor = (init_supports_color(), __toCommonJS(supports_color_exports));
		if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) exports.colors = [
			20,
			21,
			26,
			27,
			32,
			33,
			38,
			39,
			40,
			41,
			42,
			43,
			44,
			45,
			56,
			57,
			62,
			63,
			68,
			69,
			74,
			75,
			76,
			77,
			78,
			79,
			80,
			81,
			92,
			93,
			98,
			99,
			112,
			113,
			128,
			129,
			134,
			135,
			148,
			149,
			160,
			161,
			162,
			163,
			164,
			165,
			166,
			167,
			168,
			169,
			170,
			171,
			172,
			173,
			178,
			179,
			184,
			185,
			196,
			197,
			198,
			199,
			200,
			201,
			202,
			203,
			204,
			205,
			206,
			207,
			208,
			209,
			214,
			215,
			220,
			221
		];
	} catch (error) {}
	/**
	* Build up the default `inspectOpts` object from the environment variables.
	*
	*   $ DEBUG_COLORS=no DEBUG_DEPTH=10 DEBUG_SHOW_HIDDEN=enabled node script.js
	*/
	exports.inspectOpts = Object.keys(process.env).filter((key) => {
		return /^debug_/i.test(key);
	}).reduce((obj, key) => {
		const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
			return k.toUpperCase();
		});
		let val = process.env[key];
		if (/^(yes|on|true|enabled)$/i.test(val)) val = true;
		else if (/^(no|off|false|disabled)$/i.test(val)) val = false;
		else if (val === "null") val = null;
		else val = Number(val);
		obj[prop] = val;
		return obj;
	}, {});
	/**
	* Is stdout a TTY? Colored output is enabled when `true`.
	*/
	function useColors() {
		return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty$1.isatty(process.stderr.fd);
	}
	/**
	* Adds ANSI color escape codes if enabled.
	*
	* @api public
	*/
	function formatArgs(args) {
		const { namespace: name, useColors } = this;
		if (useColors) {
			const c = this.color;
			const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
			const prefix = `  ${colorCode};1m${name} \u001B[0m`;
			args[0] = prefix + args[0].split("\n").join("\n" + prefix);
			args.push(colorCode + "m+" + module.exports.humanize(this.diff) + "\x1B[0m");
		} else args[0] = getDate() + name + " " + args[0];
	}
	function getDate() {
		if (exports.inspectOpts.hideDate) return "";
		return (/* @__PURE__ */ new Date()).toISOString() + " ";
	}
	/**
	* Invokes `util.formatWithOptions()` with the specified arguments and writes to stderr.
	*/
	function log(...args) {
		return process.stderr.write(util.formatWithOptions(exports.inspectOpts, ...args) + "\n");
	}
	/**
	* Save `namespaces`.
	*
	* @param {String} namespaces
	* @api private
	*/
	function save(namespaces) {
		if (namespaces) process.env.DEBUG = namespaces;
		else delete process.env.DEBUG;
	}
	/**
	* Load `namespaces`.
	*
	* @return {String} returns the previously persisted debug modes
	* @api private
	*/
	function load() {
		return process.env.DEBUG;
	}
	/**
	* Init logic for `debug` instances.
	*
	* Create a new `inspectOpts` object in case `useColors` is set
	* differently for a particular `debug` instance.
	*/
	function init(debug) {
		debug.inspectOpts = {};
		const keys = Object.keys(exports.inspectOpts);
		for (let i = 0; i < keys.length; i++) debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
	}
	module.exports = require_common()(exports);
	const { formatters } = module.exports;
	/**
	* Map %o to `util.inspect()`, all on a single line.
	*/
	formatters.o = function(v) {
		this.inspectOpts.colors = this.useColors;
		return util.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
	};
	/**
	* Map %O to `util.inspect()`, allowing multiple lines if needed.
	*/
	formatters.O = function(v) {
		this.inspectOpts.colors = this.useColors;
		return util.inspect(v, this.inspectOpts);
	};
}));
//#endregion
//#region node_modules/.pnpm/debug@4.4.3_supports-color@9.4.0/node_modules/debug/src/index.js
var require_src = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* Detect Electron renderer / nwjs process, which is node, but we should
	* treat as a browser.
	*/
	if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) module.exports = require_browser();
	else module.exports = require_node();
}));
//#endregion
//#region node_modules/.pnpm/follow-redirects@1.16.0_debug@4.4.3_supports-color@9.4.0_/node_modules/follow-redirects/debug.js
var require_debug = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var debug;
	module.exports = function() {
		if (!debug) {
			try {
				debug = require_src()("follow-redirects");
			} catch (error) {}
			if (typeof debug !== "function") debug = function() {};
		}
		debug.apply(null, arguments);
	};
}));
//#endregion
//#region node_modules/.pnpm/follow-redirects@1.16.0_debug@4.4.3_supports-color@9.4.0_/node_modules/follow-redirects/index.js
var require_follow_redirects = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var url = __require("url");
	var URL = url.URL;
	var http$2 = __require("http");
	var https$2 = __require("https");
	var Writable = __require("stream").Writable;
	var assert = __require("assert");
	var debug = require_debug();
	// istanbul ignore next
	(function detectUnsupportedEnvironment() {
		var looksLikeNode = typeof process !== "undefined";
		var looksLikeBrowser = typeof window !== "undefined" && typeof document !== "undefined";
		var looksLikeV8 = isFunction(Error.captureStackTrace);
		if (!looksLikeNode && (looksLikeBrowser || !looksLikeV8)) console.warn("The follow-redirects package should be excluded from browser builds.");
	})();
	var useNativeURL = false;
	try {
		assert(new URL(""));
	} catch (error) {
		useNativeURL = error.code === "ERR_INVALID_URL";
	}
	var sensitiveHeaders = [
		"Authorization",
		"Proxy-Authorization",
		"Cookie"
	];
	var preservedUrlFields = [
		"auth",
		"host",
		"hostname",
		"href",
		"path",
		"pathname",
		"port",
		"protocol",
		"query",
		"search",
		"hash"
	];
	var events = [
		"abort",
		"aborted",
		"connect",
		"error",
		"socket",
		"timeout"
	];
	var eventHandlers = Object.create(null);
	events.forEach(function(event) {
		eventHandlers[event] = function(arg1, arg2, arg3) {
			this._redirectable.emit(event, arg1, arg2, arg3);
		};
	});
	var InvalidUrlError = createErrorType("ERR_INVALID_URL", "Invalid URL", TypeError);
	var RedirectionError = createErrorType("ERR_FR_REDIRECTION_FAILURE", "Redirected request failed");
	var TooManyRedirectsError = createErrorType("ERR_FR_TOO_MANY_REDIRECTS", "Maximum number of redirects exceeded", RedirectionError);
	var MaxBodyLengthExceededError = createErrorType("ERR_FR_MAX_BODY_LENGTH_EXCEEDED", "Request body larger than maxBodyLength limit");
	var WriteAfterEndError = createErrorType("ERR_STREAM_WRITE_AFTER_END", "write after end");
	// istanbul ignore next
	var destroy = Writable.prototype.destroy || noop;
	function RedirectableRequest(options, responseCallback) {
		Writable.call(this);
		this._sanitizeOptions(options);
		this._options = options;
		this._ended = false;
		this._ending = false;
		this._redirectCount = 0;
		this._redirects = [];
		this._requestBodyLength = 0;
		this._requestBodyBuffers = [];
		if (responseCallback) this.on("response", responseCallback);
		var self = this;
		this._onNativeResponse = function(response) {
			try {
				self._processResponse(response);
			} catch (cause) {
				self.emit("error", cause instanceof RedirectionError ? cause : new RedirectionError({ cause }));
			}
		};
		this._headerFilter = new RegExp("^(?:" + sensitiveHeaders.concat(options.sensitiveHeaders).map(escapeRegex).join("|") + ")$", "i");
		this._performRequest();
	}
	RedirectableRequest.prototype = Object.create(Writable.prototype);
	RedirectableRequest.prototype.abort = function() {
		destroyRequest(this._currentRequest);
		this._currentRequest.abort();
		this.emit("abort");
	};
	RedirectableRequest.prototype.destroy = function(error) {
		destroyRequest(this._currentRequest, error);
		destroy.call(this, error);
		return this;
	};
	RedirectableRequest.prototype.write = function(data, encoding, callback) {
		if (this._ending) throw new WriteAfterEndError();
		if (!isString(data) && !isBuffer(data)) throw new TypeError("data should be a string, Buffer or Uint8Array");
		if (isFunction(encoding)) {
			callback = encoding;
			encoding = null;
		}
		if (data.length === 0) {
			if (callback) callback();
			return;
		}
		if (this._requestBodyLength + data.length <= this._options.maxBodyLength) {
			this._requestBodyLength += data.length;
			this._requestBodyBuffers.push({
				data,
				encoding
			});
			this._currentRequest.write(data, encoding, callback);
		} else {
			this.emit("error", new MaxBodyLengthExceededError());
			this.abort();
		}
	};
	RedirectableRequest.prototype.end = function(data, encoding, callback) {
		if (isFunction(data)) {
			callback = data;
			data = encoding = null;
		} else if (isFunction(encoding)) {
			callback = encoding;
			encoding = null;
		}
		if (!data) {
			this._ended = this._ending = true;
			this._currentRequest.end(null, null, callback);
		} else {
			var self = this;
			var currentRequest = this._currentRequest;
			this.write(data, encoding, function() {
				self._ended = true;
				currentRequest.end(null, null, callback);
			});
			this._ending = true;
		}
	};
	RedirectableRequest.prototype.setHeader = function(name, value) {
		this._options.headers[name] = value;
		this._currentRequest.setHeader(name, value);
	};
	RedirectableRequest.prototype.removeHeader = function(name) {
		delete this._options.headers[name];
		this._currentRequest.removeHeader(name);
	};
	RedirectableRequest.prototype.setTimeout = function(msecs, callback) {
		var self = this;
		function destroyOnTimeout(socket) {
			socket.setTimeout(msecs);
			socket.removeListener("timeout", socket.destroy);
			socket.addListener("timeout", socket.destroy);
		}
		function startTimer(socket) {
			if (self._timeout) clearTimeout(self._timeout);
			self._timeout = setTimeout(function() {
				self.emit("timeout");
				clearTimer();
			}, msecs);
			destroyOnTimeout(socket);
		}
		function clearTimer() {
			if (self._timeout) {
				clearTimeout(self._timeout);
				self._timeout = null;
			}
			self.removeListener("abort", clearTimer);
			self.removeListener("error", clearTimer);
			self.removeListener("response", clearTimer);
			self.removeListener("close", clearTimer);
			if (callback) self.removeListener("timeout", callback);
			if (!self.socket) self._currentRequest.removeListener("socket", startTimer);
		}
		if (callback) this.on("timeout", callback);
		if (this.socket) startTimer(this.socket);
		else this._currentRequest.once("socket", startTimer);
		this.on("socket", destroyOnTimeout);
		this.on("abort", clearTimer);
		this.on("error", clearTimer);
		this.on("response", clearTimer);
		this.on("close", clearTimer);
		return this;
	};
	[
		"flushHeaders",
		"getHeader",
		"setNoDelay",
		"setSocketKeepAlive"
	].forEach(function(method) {
		RedirectableRequest.prototype[method] = function(a, b) {
			return this._currentRequest[method](a, b);
		};
	});
	[
		"aborted",
		"connection",
		"socket"
	].forEach(function(property) {
		Object.defineProperty(RedirectableRequest.prototype, property, { get: function() {
			return this._currentRequest[property];
		} });
	});
	RedirectableRequest.prototype._sanitizeOptions = function(options) {
		if (!options.headers) options.headers = {};
		if (!isArray(options.sensitiveHeaders)) options.sensitiveHeaders = [];
		if (options.host) {
			if (!options.hostname) options.hostname = options.host;
			delete options.host;
		}
		if (!options.pathname && options.path) {
			var searchPos = options.path.indexOf("?");
			if (searchPos < 0) options.pathname = options.path;
			else {
				options.pathname = options.path.substring(0, searchPos);
				options.search = options.path.substring(searchPos);
			}
		}
	};
	RedirectableRequest.prototype._performRequest = function() {
		var protocol = this._options.protocol;
		var nativeProtocol = this._options.nativeProtocols[protocol];
		if (!nativeProtocol) throw new TypeError("Unsupported protocol " + protocol);
		if (this._options.agents) {
			var scheme = protocol.slice(0, -1);
			this._options.agent = this._options.agents[scheme];
		}
		var request = this._currentRequest = nativeProtocol.request(this._options, this._onNativeResponse);
		request._redirectable = this;
		for (var event of events) request.on(event, eventHandlers[event]);
		this._currentUrl = /^\//.test(this._options.path) ? url.format(this._options) : this._options.path;
		if (this._isRedirect) {
			var i = 0;
			var self = this;
			var buffers = this._requestBodyBuffers;
			(function writeNext(error) {
				// istanbul ignore else
				if (request === self._currentRequest) {
					// istanbul ignore if
					if (error) self.emit("error", error);
					else if (i < buffers.length) {
						var buffer = buffers[i++];
						// istanbul ignore else
						if (!request.finished) request.write(buffer.data, buffer.encoding, writeNext);
					} else if (self._ended) request.end();
				}
			})();
		}
	};
	RedirectableRequest.prototype._processResponse = function(response) {
		var statusCode = response.statusCode;
		if (this._options.trackRedirects) this._redirects.push({
			url: this._currentUrl,
			headers: response.headers,
			statusCode
		});
		var location = response.headers.location;
		if (!location || this._options.followRedirects === false || statusCode < 300 || statusCode >= 400) {
			response.responseUrl = this._currentUrl;
			response.redirects = this._redirects;
			this.emit("response", response);
			this._requestBodyBuffers = [];
			return;
		}
		destroyRequest(this._currentRequest);
		response.destroy();
		if (++this._redirectCount > this._options.maxRedirects) throw new TooManyRedirectsError();
		var requestHeaders;
		var beforeRedirect = this._options.beforeRedirect;
		if (beforeRedirect) requestHeaders = Object.assign({ Host: response.req.getHeader("host") }, this._options.headers);
		var method = this._options.method;
		if ((statusCode === 301 || statusCode === 302) && this._options.method === "POST" || statusCode === 303 && !/^(?:GET|HEAD)$/.test(this._options.method)) {
			this._options.method = "GET";
			this._requestBodyBuffers = [];
			removeMatchingHeaders(/^content-/i, this._options.headers);
		}
		var currentHostHeader = removeMatchingHeaders(/^host$/i, this._options.headers);
		var currentUrlParts = parseUrl(this._currentUrl);
		var currentHost = currentHostHeader || currentUrlParts.host;
		var currentUrl = /^\w+:/.test(location) ? this._currentUrl : url.format(Object.assign(currentUrlParts, { host: currentHost }));
		var redirectUrl = resolveUrl(location, currentUrl);
		debug("redirecting to", redirectUrl.href);
		this._isRedirect = true;
		spreadUrlObject(redirectUrl, this._options);
		if (redirectUrl.protocol !== currentUrlParts.protocol && redirectUrl.protocol !== "https:" || redirectUrl.host !== currentHost && !isSubdomain(redirectUrl.host, currentHost)) removeMatchingHeaders(this._headerFilter, this._options.headers);
		if (isFunction(beforeRedirect)) {
			var responseDetails = {
				headers: response.headers,
				statusCode
			};
			var requestDetails = {
				url: currentUrl,
				method,
				headers: requestHeaders
			};
			beforeRedirect(this._options, responseDetails, requestDetails);
			this._sanitizeOptions(this._options);
		}
		this._performRequest();
	};
	function wrap(protocols) {
		var exports$1 = {
			maxRedirects: 21,
			maxBodyLength: 10 * 1024 * 1024
		};
		var nativeProtocols = {};
		Object.keys(protocols).forEach(function(scheme) {
			var protocol = scheme + ":";
			var nativeProtocol = nativeProtocols[protocol] = protocols[scheme];
			var wrappedProtocol = exports$1[scheme] = Object.create(nativeProtocol);
			function request(input, options, callback) {
				if (isURL(input)) input = spreadUrlObject(input);
				else if (isString(input)) input = spreadUrlObject(parseUrl(input));
				else {
					callback = options;
					options = validateUrl(input);
					input = { protocol };
				}
				if (isFunction(options)) {
					callback = options;
					options = null;
				}
				options = Object.assign({
					maxRedirects: exports$1.maxRedirects,
					maxBodyLength: exports$1.maxBodyLength
				}, input, options);
				options.nativeProtocols = nativeProtocols;
				if (!isString(options.host) && !isString(options.hostname)) options.hostname = "::1";
				assert.equal(options.protocol, protocol, "protocol mismatch");
				debug("options", options);
				return new RedirectableRequest(options, callback);
			}
			function get(input, options, callback) {
				var wrappedRequest = wrappedProtocol.request(input, options, callback);
				wrappedRequest.end();
				return wrappedRequest;
			}
			Object.defineProperties(wrappedProtocol, {
				request: {
					value: request,
					configurable: true,
					enumerable: true,
					writable: true
				},
				get: {
					value: get,
					configurable: true,
					enumerable: true,
					writable: true
				}
			});
		});
		return exports$1;
	}
	function noop() {}
	function parseUrl(input) {
		var parsed;
		// istanbul ignore else
		if (useNativeURL) parsed = new URL(input);
		else {
			parsed = validateUrl(url.parse(input));
			if (!isString(parsed.protocol)) throw new InvalidUrlError({ input });
		}
		return parsed;
	}
	function resolveUrl(relative, base) {
		// istanbul ignore next
		return useNativeURL ? new URL(relative, base) : parseUrl(url.resolve(base, relative));
	}
	function validateUrl(input) {
		if (/^\[/.test(input.hostname) && !/^\[[:0-9a-f]+\]$/i.test(input.hostname)) throw new InvalidUrlError({ input: input.href || input });
		if (/^\[/.test(input.host) && !/^\[[:0-9a-f]+\](:\d+)?$/i.test(input.host)) throw new InvalidUrlError({ input: input.href || input });
		return input;
	}
	function spreadUrlObject(urlObject, target) {
		var spread = target || {};
		for (var key of preservedUrlFields) spread[key] = urlObject[key];
		if (spread.hostname.startsWith("[")) spread.hostname = spread.hostname.slice(1, -1);
		if (spread.port !== "") spread.port = Number(spread.port);
		spread.path = spread.search ? spread.pathname + spread.search : spread.pathname;
		return spread;
	}
	function removeMatchingHeaders(regex, headers) {
		var lastValue;
		for (var header in headers) if (regex.test(header)) {
			lastValue = headers[header];
			delete headers[header];
		}
		return lastValue === null || typeof lastValue === "undefined" ? void 0 : String(lastValue).trim();
	}
	function createErrorType(code, message, baseClass) {
		function CustomError(properties) {
			// istanbul ignore else
			if (isFunction(Error.captureStackTrace)) Error.captureStackTrace(this, this.constructor);
			Object.assign(this, properties || {});
			this.code = code;
			this.message = this.cause ? message + ": " + this.cause.message : message;
		}
		CustomError.prototype = new (baseClass || Error)();
		Object.defineProperties(CustomError.prototype, {
			constructor: {
				value: CustomError,
				enumerable: false
			},
			name: {
				value: "Error [" + code + "]",
				enumerable: false
			}
		});
		return CustomError;
	}
	function destroyRequest(request, error) {
		for (var event of events) request.removeListener(event, eventHandlers[event]);
		request.on("error", noop);
		request.destroy(error);
	}
	function isSubdomain(subdomain, domain) {
		assert(isString(subdomain) && isString(domain));
		var dot = subdomain.length - domain.length - 1;
		return dot > 0 && subdomain[dot] === "." && subdomain.endsWith(domain);
	}
	function isArray(value) {
		return value instanceof Array;
	}
	function isString(value) {
		return typeof value === "string" || value instanceof String;
	}
	function isFunction(value) {
		return typeof value === "function";
	}
	function isBuffer(value) {
		return typeof value === "object" && "length" in value;
	}
	function isURL(value) {
		return URL && value instanceof URL;
	}
	function escapeRegex(regex) {
		return regex.replace(/[\]\\/()*+?.$]/g, "\\$&");
	}
	module.exports = wrap({
		http: http$2,
		https: https$2
	});
	module.exports.wrap = wrap;
}));
//#endregion
//#region node_modules/.pnpm/http-proxy@1.18.1_debug@4.4.3_supports-color@9.4.0_/node_modules/http-proxy/lib/http-proxy/passes/web-incoming.js
var require_web_incoming = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var httpNative = __require("http"), httpsNative = __require("https"), web_o = require_web_outgoing(), common$1 = require_common$1(), followRedirects = require_follow_redirects();
	web_o = Object.keys(web_o).map(function(pass) {
		return web_o[pass];
	});
	var nativeAgents = {
		http: httpNative,
		https: httpsNative
	};
	/*!
	* Array of passes.
	*
	* A `pass` is just a function that is executed on `req, res, options`
	* so that you can easily add new checks while still keeping the base
	* flexible.
	*/
	module.exports = {
		/**
		* Sets `content-length` to '0' if request is of DELETE type.
		*
		* @param {ClientRequest} Req Request object
		* @param {IncomingMessage} Res Response object
		* @param {Object} Options Config object passed to the proxy
		*
		* @api private
		*/
		deleteLength: function deleteLength(req, res, options) {
			if ((req.method === "DELETE" || req.method === "OPTIONS") && !req.headers["content-length"]) {
				req.headers["content-length"] = "0";
				delete req.headers["transfer-encoding"];
			}
		},
		/**
		* Sets timeout in request socket if it was specified in options.
		*
		* @param {ClientRequest} Req Request object
		* @param {IncomingMessage} Res Response object
		* @param {Object} Options Config object passed to the proxy
		*
		* @api private
		*/
		timeout: function timeout(req, res, options) {
			if (options.timeout) req.socket.setTimeout(options.timeout);
		},
		/**
		* Sets `x-forwarded-*` headers if specified in config.
		*
		* @param {ClientRequest} Req Request object
		* @param {IncomingMessage} Res Response object
		* @param {Object} Options Config object passed to the proxy
		*
		* @api private
		*/
		XHeaders: function XHeaders(req, res, options) {
			if (!options.xfwd) return;
			var encrypted = req.isSpdy || common$1.hasEncryptedConnection(req);
			var values = {
				for: req.connection.remoteAddress || req.socket.remoteAddress,
				port: common$1.getPort(req),
				proto: encrypted ? "https" : "http"
			};
			[
				"for",
				"port",
				"proto"
			].forEach(function(header) {
				req.headers["x-forwarded-" + header] = (req.headers["x-forwarded-" + header] || "") + (req.headers["x-forwarded-" + header] ? "," : "") + values[header];
			});
			req.headers["x-forwarded-host"] = req.headers["x-forwarded-host"] || req.headers["host"] || "";
		},
		/**
		* Does the actual proxying. If `forward` is enabled fires up
		* a ForwardStream, same happens for ProxyStream. The request
		* just dies otherwise.
		*
		* @param {ClientRequest} Req Request object
		* @param {IncomingMessage} Res Response object
		* @param {Object} Options Config object passed to the proxy
		*
		* @api private
		*/
		stream: function stream(req, res, options, _, server, clb) {
			server.emit("start", req, res, options.target || options.forward);
			var agents = options.followRedirects ? followRedirects : nativeAgents;
			var http = agents.http;
			var https = agents.https;
			if (options.forward) {
				var forwardReq = (options.forward.protocol === "https:" ? https : http).request(common$1.setupOutgoing(options.ssl || {}, options, req, "forward"));
				var forwardError = createErrorHandler(forwardReq, options.forward);
				req.on("error", forwardError);
				forwardReq.on("error", forwardError);
				(options.buffer || req).pipe(forwardReq);
				if (!options.target) return res.end();
			}
			var proxyReq = (options.target.protocol === "https:" ? https : http).request(common$1.setupOutgoing(options.ssl || {}, options, req));
			proxyReq.on("socket", function(socket) {
				if (server && !proxyReq.getHeader("expect")) server.emit("proxyReq", proxyReq, req, res, options);
			});
			if (options.proxyTimeout) proxyReq.setTimeout(options.proxyTimeout, function() {
				proxyReq.abort();
			});
			req.on("aborted", function() {
				proxyReq.abort();
			});
			var proxyError = createErrorHandler(proxyReq, options.target);
			req.on("error", proxyError);
			proxyReq.on("error", proxyError);
			function createErrorHandler(proxyReq, url) {
				return function proxyError(err) {
					if (req.socket.destroyed && err.code === "ECONNRESET") {
						server.emit("econnreset", err, req, res, url);
						return proxyReq.abort();
					}
					if (clb) clb(err, req, res, url);
					else server.emit("error", err, req, res, url);
				};
			}
			(options.buffer || req).pipe(proxyReq);
			proxyReq.on("response", function(proxyRes) {
				if (server) server.emit("proxyRes", proxyRes, req, res);
				if (!res.headersSent && !options.selfHandleResponse) {
					for (var i = 0; i < web_o.length; i++) if (web_o[i](req, res, proxyRes, options)) break;
				}
				if (!res.finished) {
					proxyRes.on("end", function() {
						if (server) server.emit("end", req, res, proxyRes);
					});
					if (!options.selfHandleResponse) proxyRes.pipe(res);
				} else if (server) server.emit("end", req, res, proxyRes);
			});
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/http-proxy@1.18.1_debug@4.4.3_supports-color@9.4.0_/node_modules/http-proxy/lib/http-proxy/passes/ws-incoming.js
var require_ws_incoming = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var http$1 = __require("http"), https$1 = __require("https"), common = require_common$1();
	/*!
	* Array of passes.
	*
	* A `pass` is just a function that is executed on `req, socket, options`
	* so that you can easily add new checks while still keeping the base
	* flexible.
	*/
	module.exports = {
		/**
		* WebSocket requests must have the `GET` method and
		* the `upgrade:websocket` header
		*
		* @param {ClientRequest} Req Request object
		* @param {Socket} Websocket
		*
		* @api private
		*/
		checkMethodAndHeader: function checkMethodAndHeader(req, socket) {
			if (req.method !== "GET" || !req.headers.upgrade) {
				socket.destroy();
				return true;
			}
			if (req.headers.upgrade.toLowerCase() !== "websocket") {
				socket.destroy();
				return true;
			}
		},
		/**
		* Sets `x-forwarded-*` headers if specified in config.
		*
		* @param {ClientRequest} Req Request object
		* @param {Socket} Websocket
		* @param {Object} Options Config object passed to the proxy
		*
		* @api private
		*/
		XHeaders: function XHeaders(req, socket, options) {
			if (!options.xfwd) return;
			var values = {
				for: req.connection.remoteAddress || req.socket.remoteAddress,
				port: common.getPort(req),
				proto: common.hasEncryptedConnection(req) ? "wss" : "ws"
			};
			[
				"for",
				"port",
				"proto"
			].forEach(function(header) {
				req.headers["x-forwarded-" + header] = (req.headers["x-forwarded-" + header] || "") + (req.headers["x-forwarded-" + header] ? "," : "") + values[header];
			});
		},
		/**
		* Does the actual proxying. Make the request and upgrade it
		* send the Switching Protocols request and pipe the sockets.
		*
		* @param {ClientRequest} Req Request object
		* @param {Socket} Websocket
		* @param {Object} Options Config object passed to the proxy
		*
		* @api private
		*/
		stream: function stream(req, socket, options, head, server, clb) {
			var createHttpHeader = function(line, headers) {
				return Object.keys(headers).reduce(function(head, key) {
					var value = headers[key];
					if (!Array.isArray(value)) {
						head.push(key + ": " + value);
						return head;
					}
					for (var i = 0; i < value.length; i++) head.push(key + ": " + value[i]);
					return head;
				}, [line]).join("\r\n") + "\r\n\r\n";
			};
			common.setupSocket(socket);
			if (head && head.length) socket.unshift(head);
			var proxyReq = (common.isSSL.test(options.target.protocol) ? https$1 : http$1).request(common.setupOutgoing(options.ssl || {}, options, req));
			if (server) server.emit("proxyReqWs", proxyReq, req, socket, options, head);
			proxyReq.on("error", onOutgoingError);
			proxyReq.on("response", function(res) {
				if (!res.upgrade) {
					socket.write(createHttpHeader("HTTP/" + res.httpVersion + " " + res.statusCode + " " + res.statusMessage, res.headers));
					res.pipe(socket);
				}
			});
			proxyReq.on("upgrade", function(proxyRes, proxySocket, proxyHead) {
				proxySocket.on("error", onOutgoingError);
				proxySocket.on("end", function() {
					server.emit("close", proxyRes, proxySocket, proxyHead);
				});
				socket.on("error", function() {
					proxySocket.end();
				});
				common.setupSocket(proxySocket);
				if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
				socket.write(createHttpHeader("HTTP/1.1 101 Switching Protocols", proxyRes.headers));
				proxySocket.pipe(socket).pipe(proxySocket);
				server.emit("open", proxySocket);
				server.emit("proxySocket", proxySocket);
			});
			return proxyReq.end();
			function onOutgoingError(err) {
				if (clb) clb(err, req, socket);
				else server.emit("error", err, req, socket);
				socket.end();
			}
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/http-proxy@1.18.1_debug@4.4.3_supports-color@9.4.0_/node_modules/http-proxy/lib/http-proxy/index.js
var require_http_proxy$2 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var httpProxy$1 = module.exports, extend = __require("util")._extend, parse_url = __require("url").parse, EE3 = require_eventemitter3(), http = __require("http"), https = __require("https"), web = require_web_incoming(), ws = require_ws_incoming();
	httpProxy$1.Server = ProxyServer;
	/**
	* Returns a function that creates the loader for
	* either `ws` or `web`'s  passes.
	*
	* Examples:
	*
	*    httpProxy.createRightProxy('ws')
	*    // => [Function]
	*
	* @param {String} Type Either 'ws' or 'web'
	* 
	* @return {Function} Loader Function that when called returns an iterator for the right passes
	*
	* @api private
	*/
	function createRightProxy(type) {
		return function(options) {
			return function(req, res) {
				var passes = type === "ws" ? this.wsPasses : this.webPasses, args = [].slice.call(arguments), cntr = args.length - 1, head, cbl;
				if (typeof args[cntr] === "function") {
					cbl = args[cntr];
					cntr--;
				}
				var requestOptions = options;
				if (!(args[cntr] instanceof Buffer) && args[cntr] !== res) {
					requestOptions = extend({}, options);
					extend(requestOptions, args[cntr]);
					cntr--;
				}
				if (args[cntr] instanceof Buffer) head = args[cntr];
				["target", "forward"].forEach(function(e) {
					if (typeof requestOptions[e] === "string") requestOptions[e] = parse_url(requestOptions[e]);
				});
				if (!requestOptions.target && !requestOptions.forward) return this.emit("error", /* @__PURE__ */ new Error("Must provide a proper URL as target"));
				for (var i = 0; i < passes.length; i++)
 /**
				* Call of passes functions
				* pass(req, res, options, head)
				*
				* In WebSockets case the `res` variable
				* refer to the connection socket
				* pass(req, socket, options, head)
				*/
				if (passes[i](req, res, requestOptions, head, this, cbl)) break;
			};
		};
	}
	httpProxy$1.createRightProxy = createRightProxy;
	function ProxyServer(options) {
		EE3.call(this);
		options = options || {};
		options.prependPath = options.prependPath === false ? false : true;
		this.web = this.proxyRequest = createRightProxy("web")(options);
		this.ws = this.proxyWebsocketRequest = createRightProxy("ws")(options);
		this.options = options;
		this.webPasses = Object.keys(web).map(function(pass) {
			return web[pass];
		});
		this.wsPasses = Object.keys(ws).map(function(pass) {
			return ws[pass];
		});
		this.on("error", this.onError, this);
	}
	__require("util").inherits(ProxyServer, EE3);
	ProxyServer.prototype.onError = function(err) {
		if (this.listeners("error").length === 1) throw err;
	};
	ProxyServer.prototype.listen = function(port, hostname) {
		var self = this, closure = function(req, res) {
			self.web(req, res);
		};
		this._server = this.options.ssl ? https.createServer(this.options.ssl, closure) : http.createServer(closure);
		if (this.options.ws) this._server.on("upgrade", function(req, socket, head) {
			self.ws(req, socket, head);
		});
		this._server.listen(port, hostname);
		return this;
	};
	ProxyServer.prototype.close = function(callback) {
		var self = this;
		if (this._server) this._server.close(done);
		function done() {
			self._server = null;
			if (callback) callback.apply(null, arguments);
		}
	};
	ProxyServer.prototype.before = function(type, passName, callback) {
		if (type !== "ws" && type !== "web") throw new Error("type must be `web` or `ws`");
		var passes = type === "ws" ? this.wsPasses : this.webPasses, i = false;
		passes.forEach(function(v, idx) {
			if (v.name === passName) i = idx;
		});
		if (i === false) throw new Error("No such pass");
		passes.splice(i, 0, callback);
	};
	ProxyServer.prototype.after = function(type, passName, callback) {
		if (type !== "ws" && type !== "web") throw new Error("type must be `web` or `ws`");
		var passes = type === "ws" ? this.wsPasses : this.webPasses, i = false;
		passes.forEach(function(v, idx) {
			if (v.name === passName) i = idx;
		});
		if (i === false) throw new Error("No such pass");
		passes.splice(i++, 0, callback);
	};
}));
//#endregion
//#region node_modules/.pnpm/http-proxy@1.18.1_debug@4.4.3_supports-color@9.4.0_/node_modules/http-proxy/lib/http-proxy.js
var require_http_proxy$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var ProxyServer = require_http_proxy$2().Server;
	/**
	* Creates the proxy server.
	*
	* Examples:
	*
	*    httpProxy.createProxyServer({ .. }, 8000)
	*    // => '{ web: [Function], ws: [Function] ... }'
	*
	* @param {Object} Options Config object passed to the proxy
	*
	* @return {Object} Proxy Proxy object with handlers for `ws` and `web` requests
	*
	* @api public
	*/
	function createProxyServer(options) {
		return new ProxyServer(options);
	}
	ProxyServer.createProxyServer = createProxyServer;
	ProxyServer.createServer = createProxyServer;
	ProxyServer.createProxy = createProxyServer;
	/**
	* Export the proxy "Server" as the main export.
	*/
	module.exports = ProxyServer;
}));
/*!
* Caron dimonio, con occhi di bragia
* loro accennando, tutte le raccoglie;
* batte col remo qualunque s’adagia 
*
* Charon the demon, with the eyes of glede,
* Beckoning to them, collects them all together,
* Beats with his oar whoever lags behind
*          
*          Dante - The Divine Comedy (Canto III)
*/
//#endregion
//#region packages/credentials/deepseek-account-platform/src/http-log.ts
var import_http_proxy = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_http_proxy$1();
})))(), 1);
/** Shared stdout + rotating file HTTP diagnostics for local DEV and Mammoth production. */
const MAX_BYTES = 5 * 1024 * 1024;
const ENV_DISABLE = "MMP_HTTP_LOG";
function enabled() {
	const raw = process.env[ENV_DISABLE];
	if (raw === "0" || raw === "false") return false;
	return true;
}
function logDir() {
	return join((process.env.MMP_HOME ?? "").trim() || join(homedir(), ".mmp"), "logs");
}
function logPath() {
	return join(logDir(), "http.log");
}
function rotateIfNeeded(path) {
	try {
		if (statSync(path).size < MAX_BYTES) return;
		renameSync(path, `${path}.1`);
	} catch {}
}
/**
* Emit one HTTP diagnostic line to stdout and `$MMP_HOME/logs/http.log` (size-capped).
* @param line - already-formatted message without trailing newline.
*/
function httpLog(line) {
	if (!enabled()) return;
	const text = `[http] ${(/* @__PURE__ */ new Date()).toISOString()} ${line}`;
	console.error(text);
	try {
		mkdirSync(logDir(), { recursive: true });
		const path = logPath();
		rotateIfNeeded(path);
		appendFileSync(path, `${text}\n`, "utf8");
	} catch (error) {
		console.error("[http] file log failed", error instanceof Error ? error.message : error);
	}
}
/**
* fetch() wrapper that logs method, URL, status/error, and duration.
* Does not log bodies or Authorization headers.
*/
async function loggedFetch(input, init) {
	const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
	const url = String(input instanceof Request ? input.url : input);
	const started = Date.now();
	try {
		const response = await fetch(input, init);
		httpLog(`${method} ${url} -> ${String(response.status)} (${String(Date.now() - started)}ms)`);
		return response;
	} catch (error) {
		httpLog(`${method} ${url} -> ERROR ${error instanceof Error ? error.message : String(error)} (${String(Date.now() - started)}ms)`);
		throw error;
	}
}
//#endregion
//#region packages/credentials/deepseek-account-platform/src/web-sso.ts
/** Cookie extraction rejects duplicate names instead of guessing which credential the browser meant. */
function groundWebCookie(request, name) {
	const headers = request.headers;
	const header = headers instanceof Headers ? headers.get("cookie") : headers.cookie;
	if (typeof header !== "string") return void 0;
	const values = header.split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
	if (values.length !== 1) return void 0;
	try {
		const token = decodeURIComponent(values[0].slice(name.length + 1));
		return token && token.length <= 8192 ? token : void 0;
	} catch {
		return;
	}
}
/** Read identity only from a Host-stored grant or after Ground has validated its signature. */
function groundWebTokenClaims(token) {
	const raw = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
	if (!raw || typeof raw !== "object") throw new Error("Invalid Ground session claims");
	const row = raw;
	if (typeof row.sub !== "string" || !row.sub || typeof row.exp !== "number" || !Number.isFinite(row.exp) || row.tenantId != null && typeof row.tenantId !== "string" || row.purpose === "browser-sso") throw new Error("Invalid Ground session claims");
	return {
		userId: row.sub,
		tenantId: typeof row.tenantId === "string" ? row.tenantId : null,
		expiresAt: row.exp * 1e3
	};
}
/** Authoritative Ground verification failure, with a safe browser-facing message. */
var GroundWebSessionError = class extends Error {
	status;
	/** @param status - HTTP refusal. @param message - Credential-free explanation. */
	constructor(status, message) {
		super(message);
		this.status = status;
	}
};
/**
* Validate a browser credential with Ground before trusting its user or enterprise claims.
* @param origin - Fixed Ground origin, never taken from the incoming browser request.
* @param token - Ground browser session JWT.
* @param signal - Request and Host lifetime.
* @returns verified identity, expiry and display-safe Ground session.
*/
async function verifyGroundWebSession(origin, token, signal) {
	const response = await loggedFetch(new URL("/api/auth/me", origin).href, {
		headers: {
			authorization: `Bearer ${token}`,
			accept: "application/json"
		},
		redirect: "error",
		signal
	});
	if (response.status === 401) {
		await response.body?.cancel();
		throw new GroundWebSessionError(401, "Ground 登录已过期");
	}
	if (!response.ok) {
		await response.body?.cancel();
		throw new GroundWebSessionError(502, "Ground 暂不可用，请稍后重试。");
	}
	const value = await response.json();
	if (typeof value !== "object" || value === null || !("user" in value) || typeof value.user !== "object" || value.user === null || !("id" in value.user) || typeof value.user.id !== "string") throw new GroundWebSessionError(502, "Ground 返回的账号信息无效。");
	const claims = groundWebTokenClaims(token);
	if (claims.expiresAt <= Date.now() || claims.userId !== value.user.id) throw new GroundWebSessionError(401, "Ground 登录已过期");
	const tenant = "currentTenant" in value ? value.currentTenant : null;
	const tenantId = tenant && typeof tenant === "object" && "id" in tenant && typeof tenant.id === "string" ? tenant.id : null;
	if (tenantId !== claims.tenantId) throw new GroundWebSessionError(403, "Ground 企业身份不一致，请重新登录。");
	if (!("isPlatformAdmin" in value.user && value.user.isPlatformAdmin === true) && tenant && typeof tenant === "object" && "status" in tenant && tenant.status !== "active") throw new GroundWebSessionError(403, "该企业已停用，请联系管理员。");
	return {
		identity: {
			userId: claims.userId,
			tenantId
		},
		expiresAt: claims.expiresAt,
		session: value
	};
}
//#endregion
//#region scripts/ground-web-router.ts
/** Local Web identity router. Each Ground user+enterprise gets an independent Harness process and home. */
/**
* Stable, filesystem-safe partition key; browser tokens rotate without changing ownership.
* @param groundOrigin - Ground authority identifying the account namespace.
* @param identity - Ground-verified user and enterprise.
* @returns opaque local partition directory name.
*/
function groundWebPartition(groundOrigin, identity) {
	return createHash("sha256").update(JSON.stringify([
		groundOrigin,
		identity.userId,
		identity.tenantId
	])).digest("hex");
}
/**
* Bind a loopback entry that verifies the browser's own Ground cookie before proxying HTTP or WebSocket traffic.
* @param options - Loopback deployment and worker lifecycle factory; ports and limits are caller-owned.
* @returns the actual public origin and an idempotent shutdown operation.
*/
async function startGroundWebRouter(options) {
	if (![
		"127.0.0.1",
		"localhost",
		"::1"
	].includes(options.host)) throw new Error("Web identity router only binds loopback addresses");
	const ground = new URL(options.groundOrigin);
	const external = options.publicOrigin === void 0 ? void 0 : new URL(options.publicOrigin);
	if (external && (external.protocol !== "https:" || external.origin !== ground.origin || external.href !== `${external.origin}/` || external.username || external.password)) throw new Error("Production Web and Ground must share one canonical HTTPS origin");
	if (!external && (ground.protocol !== "http:" || ground.hostname !== (options.host === "::1" ? "[::1]" : options.host))) throw new Error("Local Web and Ground must use the same HTTP loopback hostname");
	if (!Number.isSafeInteger(options.maxWorkers) || options.maxWorkers < 1) throw new Error("maxWorkers must be a positive integer");
	const lifetime = new AbortController();
	const workers = /* @__PURE__ */ new Map();
	const sockets = /* @__PURE__ */ new Set();
	const proxy = import_http_proxy.default.createProxyServer({
		ws: true,
		xfwd: false,
		changeOrigin: false
	});
	let origin = "";
	const loginUrl = () => {
		const url = new URL("/login", ground);
		url.searchParams.set("next", `${origin}/`);
		return url.href;
	};
	const trusted = (req) => origin !== "" && req.headers.host === new URL(origin).host && (req.headers.origin === void 0 || req.headers.origin === origin) && req.headers["sec-fetch-site"] !== "cross-site";
	const identify = async (req) => {
		const token = groundWebCookie({ headers: req.headers }, options.cookieName);
		if (token === void 0) return void 0;
		return (await verifyGroundWebSession(ground.origin, token, AbortSignal.any([lifetime.signal, AbortSignal.timeout(options.requestTimeoutMs)]))).identity;
	};
	const workerFor = (identity) => {
		const key = groundWebPartition(ground.origin, identity);
		let worker = workers.get(key);
		if (worker !== void 0) return worker;
		if (workers.size >= options.maxWorkers) return Promise.reject(/* @__PURE__ */ new Error("本机同时在线账号已达到上限，请停止服务后调整 MMP_WEB_MAX_IDENTITIES。"));
		worker = options.startWorker(identity, origin, lifetime.signal);
		workers.set(key, worker);
		worker.then((value) => {
			if (value.exited !== void 0) {
				const remove = () => {
					if (workers.get(key) === worker) workers.delete(key);
				};
				value.exited.then(remove, remove);
			}
		}, () => {
			if (workers.get(key) === worker) workers.delete(key);
		});
		return worker;
	};
	const send = (res, status, text) => {
		if (res.headersSent) {
			res.destroy();
			return;
		}
		res.writeHead(status, {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "no-store"
		}).end(text);
	};
	const redirect = (res) => {
		res.writeHead(303, {
			location: loginUrl(),
			"cache-control": "no-store",
			"referrer-policy": "no-referrer"
		}).end();
	};
	const rootRequest = (req) => {
		try {
			return [
				"/",
				"/index.html",
				"/auth/ground/logout"
			].includes(new URL(req.url ?? "/", origin).pathname);
		} catch {
			return false;
		}
	};
	const server = createServer((req, res) => {
		(async () => {
			if (!trusted(req)) {
				send(res, 403, "请求来源不受信任");
				return;
			}
			try {
				const identity = await identify(req);
				if (identity === void 0) {
					if (rootRequest(req)) redirect(res);
					else send(res, 401, "请先从 Web 首页登录");
					return;
				}
				const worker = await workerFor(identity);
				if (lifetime.signal.aborted || res.destroyed) return;
				proxy.web(req, res, { target: worker.origin }, () => {
					send(res, 502, "智能体运行环境暂不可用，请刷新重试。");
				});
			} catch (error) {
				if (!(error instanceof GroundWebSessionError)) console.error("[web-sso] isolated Host unavailable:", error instanceof Error ? error.message : String(error));
				if (error instanceof GroundWebSessionError && error.status === 401 && rootRequest(req)) redirect(res);
				else send(res, error instanceof GroundWebSessionError ? error.status : 503, error instanceof GroundWebSessionError ? error.message : "Web 登录或运行环境准备失败，请查看终端后重试。");
			}
		})();
	});
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		socket.on("error", () => socket.destroy());
	});
	server.on("upgrade", (req, socket, head) => {
		socket.on("error", () => socket.destroy());
		(async () => {
			const refuse = (status) => {
				socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
			};
			if (!trusted(req)) {
				refuse(403);
				return;
			}
			try {
				const identity = await identify(req);
				if (identity === void 0) {
					refuse(401);
					return;
				}
				const worker = await workerFor(identity);
				if (lifetime.signal.aborted || socket.destroyed) return;
				proxy.ws(req, socket, head, { target: worker.origin }, () => {
					socket.destroy();
				});
			} catch (error) {
				console.error("[web-sso] connection unavailable:", error instanceof Error ? error.message : String(error));
				refuse(503);
			}
		})();
	});
	proxy.on("error", (_error, _req, res) => {
		if ("writeHead" in res) send(res, 502, "智能体连接中断，请刷新重试。");
		else res.destroy();
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(options.port, options.host, () => {
			server.removeListener("error", reject);
			resolve();
		});
	});
	const address = server.address();
	origin = external?.origin ?? `http://${options.host === "::1" ? "[::1]" : options.host}:${address.port}`;
	let closing;
	return {
		origin,
		listenerOrigin: `http://${options.host === "::1" ? "[::1]" : options.host}:${address.port}`,
		close: () => closing ??= (async () => {
			lifetime.abort();
			for (const socket of sockets) socket.destroy();
			const closed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
			await Promise.allSettled([...workers.values()].map(async (worker) => (await worker).close()));
			await closed;
		})()
	};
}
//#endregion
//#region scripts/serve-ground-web.ts
/** Launch the local multi-browser Web router; every identity Host still starts through the supported mmp profile. */
const ROOT = resolve(import.meta.dirname, "..");
function positiveEnvironment(name, fallback) {
	const value = Number(process.env[name] ?? fallback);
	if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new Error(`${name} must be a positive integer`);
	return value;
}
async function startIdentityHost(identity, publicOrigin, signal, options) {
	const home = join(options.home, "web-identities", groundWebPartition(options.groundOrigin, identity));
	signal.throwIfAborted();
	await mkdir(home, { recursive: true });
	signal.throwIfAborted();
	const docker = process.env.MMP_WEB_WORKER_MODE === "docker";
	const partition = groundWebPartition(options.groundOrigin, identity);
	const container = `mmp-user-${process.pid}-${partition.slice(0, 24)}`;
	const cli = process.env.MMP_WEB_BUILT_RUNTIME === "1" ? [join(ROOT, "apps/cli/lib/bin.js")] : [
		"--import",
		import.meta.resolve("tsx/esm"),
		join(ROOT, "apps/cli/src/bin.ts")
	];
	const webArgs = [
		"web",
		...options.workerArgs,
		"--host",
		"127.0.0.1",
		"--port",
		"0",
		"--no-open",
		"--public-url",
		publicOrigin,
		"--trusted-host",
		new URL(publicOrigin).host
	];
	let command = process.execPath, args = [...cli, ...webArgs];
	if (docker) {
		if (options.workerArgs.length) throw new Error("Production workers use the image profile; arbitrary CLI overrides are not allowed");
		const image = process.env.MMP_WEB_WORKER_IMAGE;
		const hostRoot = process.env.MMP_WEB_HOST_DATA_ROOT;
		if (!image || !hostRoot || !hostRoot.startsWith("/") || hostRoot.includes(",")) throw new Error("Set MMP_WEB_WORKER_IMAGE and an absolute MMP_WEB_HOST_DATA_ROOT");
		await chown(home, 10001, 10001);
		command = "docker";
		args = [
			"run",
			"--rm",
			"--init",
			"--name",
			container,
			"--network",
			"host",
			"--read-only",
			"--user",
			"10001:10001",
			"--cap-drop",
			"ALL",
			"--security-opt",
			"no-new-privileges",
			"--pids-limit",
			String(positiveEnvironment("MMP_WEB_WORKER_PIDS", 256)),
			"--memory",
			`${positiveEnvironment("MMP_WEB_WORKER_MEMORY_MB", 1024)}m`,
			"--cpus",
			String(positiveEnvironment("MMP_WEB_WORKER_CPUS", 1)),
			"--tmpfs",
			"/tmp:rw,nosuid,nodev,exec,size=256m",
			"--mount",
			`type=bind,source=${join(hostRoot, "web-identities", partition)},target=/home/mmp`,
			"--workdir",
			"/home/mmp",
			"-e",
			"MMP_HOME=/home/mmp",
			"-e",
			"MMP_WEB_SSO=1",
			"-e",
			"MMP_WEB_READY_STDOUT=1",
			"-e",
			`MMP_WEB_SESSION_ORIGIN=${publicOrigin}`,
			"-e",
			`GROUND_PUBLIC_ORIGIN=${options.groundOrigin}`,
			image,
			"node",
			"/app/apps/cli/lib/bin.js",
			...webArgs
		];
	}
	const child = spawn(command, args, {
		cwd: ROOT,
		env: {
			...process.env,
			MMP_HOME: home,
			MMP_WEB_SSO: "1",
			MMP_WEB_SESSION_ORIGIN: publicOrigin,
			GROUND_PUBLIC_ORIGIN: options.groundOrigin
		},
		stdio: docker ? [
			"ignore",
			"pipe",
			"pipe"
		] : [
			"ignore",
			"pipe",
			"pipe",
			"ipc"
		]
	});
	const exited = new Promise((resolveExit) => {
		child.once("exit", () => resolveExit());
		child.once("error", () => resolveExit());
	});
	let stopping;
	const close = () => stopping ??= (async () => {
		if (child.exitCode !== null || child.signalCode !== null) return;
		if (docker) {
			const stop = spawn("docker", [
				"stop",
				"--time",
				"5",
				container
			], { stdio: "ignore" });
			await new Promise((done) => {
				stop.once("exit", () => done());
				stop.once("error", () => done());
			});
		}
		child.kill("SIGTERM");
		let timer;
		await Promise.race([exited, new Promise((done) => {
			timer = setTimeout(done, 3e3);
		})]);
		clearTimeout(timer);
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
			await exited;
		}
	})();
	const abort = () => {
		close();
	};
	signal.addEventListener("abort", abort, { once: true });
	if (signal.aborted) abort();
	exited.then(() => {
		signal.removeEventListener("abort", abort);
	});
	const output = createInterface({ input: child.stdout });
	const errors = createInterface({ input: child.stderr });
	let stderrTail = "";
	errors.on("line", (line) => {
		stderrTail = `${stderrTail}\n${line}`.slice(-4e3);
		console.error(line);
	});
	try {
		return await new Promise((ready, fail) => {
			const timer = setTimeout(() => fail(/* @__PURE__ */ new Error("Web identity Host startup timed out")), options.startupTimeoutMs);
			const finish = (error) => {
				clearTimeout(timer);
				if (error) fail(error);
			};
			child.once("error", (error) => finish(error));
			exited.then(() => finish(/* @__PURE__ */ new Error(`Web identity Host exited before readiness: ${stderrTail}`)));
			const onReady = (message) => {
				if (typeof message !== "object" || message === null || !("type" in message) || message.type !== "mmp-web-ready" || !("origin" in message) || typeof message.origin !== "string") return;
				try {
					const privateUrl = new URL(message.origin);
					if (privateUrl.protocol !== "http:" || privateUrl.hostname !== "127.0.0.1" || !privateUrl.port || privateUrl.username || privateUrl.password || privateUrl.pathname !== "/" || privateUrl.search || privateUrl.hash) throw new Error("Invalid Web identity Host listener");
					clearTimeout(timer);
					ready({
						origin: privateUrl.origin,
						exited,
						close
					});
				} catch {
					finish(/* @__PURE__ */ new Error("Invalid Web identity Host readiness message"));
				}
			};
			child.on("message", onReady);
			output.on("line", (line) => {
				if (line.startsWith("mmp-worker-ready: ")) try {
					onReady(JSON.parse(line.slice(18)));
				} catch {
					finish(/* @__PURE__ */ new Error("Invalid worker readiness output"));
				}
				else if (!line.startsWith("mmp web: ")) console.log(line);
			});
		});
	} catch (error) {
		await close();
		throw error;
	}
}
async function main() {
	const args = process.argv.slice(2), workerArgs = [];
	if (process.env.MMP_WEB_SSO === "0" || args.includes("--help") || args.includes("-h") || args.includes("--version")) {
		const profile = spawn(process.execPath, [
			"--import",
			import.meta.resolve("tsx/esm"),
			join(ROOT, "apps/cli/src/bin.ts"),
			"web",
			...args
		], {
			cwd: ROOT,
			env: process.env,
			stdio: "inherit"
		});
		const forward = (signal) => {
			profile.kill(signal);
		};
		process.on("SIGTERM", forward);
		process.on("SIGINT", forward);
		try {
			process.exitCode = await new Promise((done, fail) => {
				profile.once("error", fail);
				profile.once("exit", (code) => done(code ?? 1));
			});
		} finally {
			process.removeListener("SIGTERM", forward);
			process.removeListener("SIGINT", forward);
		}
		return;
	}
	let host = "127.0.0.1", port = 3080;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--host") host = args[++index] ?? "";
		else if (arg === "--port") port = Number(args[++index]);
		else if (arg.startsWith("--port=")) port = Number(arg.slice(7));
		else if (arg.startsWith("--host=")) host = arg.slice(7);
		else if (arg === "--no-open") {} else if (arg === "--public-url" || arg.startsWith("--public-url=")) throw new Error("Local Web SSO uses the loopback listener URL; public deployment needs a separate gateway.");
		else workerArgs.push(arg);
	}
	if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port must be between 0 and 65535");
	const groundOrigin = new URL(process.env.GROUND_PUBLIC_ORIGIN || process.env.MMP_PLATFORM_ORIGIN || "http://127.0.0.1:5201").origin;
	const publicOrigin = process.env.MMP_WEB_PUBLIC_ORIGIN;
	if (publicOrigin && process.env.MMP_WEB_WORKER_MODE !== "docker") throw new Error("Production Web requires isolated Docker workers");
	const router = await startGroundWebRouter({
		host,
		port,
		groundOrigin,
		...publicOrigin ? { publicOrigin } : {},
		cookieName: process.env.MMP_GROUND_COOKIE_NAME || "mammothai_access_token",
		maxWorkers: positiveEnvironment("MMP_WEB_MAX_IDENTITIES", 4),
		requestTimeoutMs: positiveEnvironment("MMP_WEB_AUTH_TIMEOUT_MS", 3e4),
		startWorker: (identity, origin, signal) => startIdentityHost(identity, origin, signal, {
			groundOrigin,
			home: resolve(process.env.MMP_HOME || join(homedir(), ".mmp")),
			workerArgs,
			startupTimeoutMs: positiveEnvironment("MMP_WEB_HOST_STARTUP_TIMEOUT_MS", 6e4)
		})
	});
	const done = Promise.withResolvers();
	const stop = () => {
		router.close().then(() => done.resolve(), (error) => {
			console.error(error);
			process.exitCode = 1;
			done.resolve();
		});
	};
	process.on("SIGINT", stop);
	process.on("SIGTERM", stop);
	console.log(`mmp web: ${router.origin}/`);
	console.log("Web SSO：各浏览器使用自己的 Ground 登录；用户和企业分别隔离。");
	await done.promise;
}
if (process.argv[1] !== void 0 && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
//#endregion
export {};
