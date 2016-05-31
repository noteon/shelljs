// jshint -W053
// Ignore warning about 'new String()'
'use strict';

var os = require('os');
var fs = require('fs');
var glob = require('glob');
var shell = require('..');
var _to = require('./to');
var _toEnd = require('./toEnd');

// Return the home directory in a platform-agnostic way, with consideration for
// older versions of node
// XXX: I don't think this should be a part of plugin.utils. Not sure what should happen to it. Maybe just inline it.
function getUserHome() {
  var result;
  if (os.homedir)
    result = os.homedir(); // node 3+
  else
    result = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
  return result;
}
exports.getUserHome = getUserHome;

// extend(target_obj, source_obj1 [, source_obj2 ...])
// Shallow extend, e.g.:
//    extend({A:1}, {b:2}, {c:3}) returns {A:1, b:2, c:3}
// XXX: Inline this
function extend(target) {
  var sources = [].slice.call(arguments, 1);
  sources.forEach(function(source) {
    for (var key in source)
      target[key] = source[key];
  });

  return target;
}
exports.extend = extend;

// Common wrapper for all Unix-like commands
// XXX: This gets it's own file.
function wrap(cmd, fn, options) {
  return function() {
    var retValue = null;

    state.currentCmd = cmd;
    state.error = null;
    state.errorCode = 0;

    try {
      var args = [].slice.call(arguments, 0);

      if (config.verbose) {
        args.unshift(cmd);
        console.error.apply(console, args);
        args.shift();
      }

      if (options && options.notUnix) {
        retValue = fn.apply(this, args);
      } else {
        if (args[0] instanceof Object && args[0].constructor.name === 'Object') {
          args = args; // object count as options
        } else if (args.length === 0 || typeof args[0] !== 'string' || args[0].length <= 1 || args[0][0] !== '-') {
          args.unshift(''); // only add dummy option if '-option' not already present
        }

        args = args.reduce(function(accum, cur) {
          if (Array.isArray(cur)) {
            return accum.concat(cur);
          } else {
            accum.push(cur);
            return accum;
          }
        }, []);
        // Convert ShellStrings to regular strings
        args = args.map(function(arg) {
          if (arg instanceof Object && arg.constructor.name === 'String') {
            return arg.toString();
          } else
            return arg;
        });
        // Expand the '~' if appropriate
        var homeDir = getUserHome();
        args = args.map(function(arg) {
          if (typeof arg === 'string' && arg.slice(0, 2) === '~/' || arg === '~')
            return arg.replace(/^~/, homeDir);
          else
            return arg;
        });
        if (!config.noglob && options && typeof options.idx === 'number')
          args = args.slice(0, options.idx).concat(expand(args.slice(options.idx)));
        try {
          retValue = fn.apply(this, args);
        } catch (e) {
          if (e.msg === 'earlyExit')
            retValue = e.retValue;
          else throw e;
        }
      }
    } catch (e) {
      if (!state.error) {
        // If state.error hasn't been set it's an error thrown by Node, not us - probably a bug...
        console.error('shell.js: internal error');
        console.error(e.stack || e);
        process.exit(1);
      }
      if (config.fatal)
        throw e;
    }

    state.currentCmd = 'shell.js';
    return retValue;
  };
} // wrap
