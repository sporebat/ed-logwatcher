/**
 * @file The file that does the watcher processing.
 * @author willyb321
 * @copyright MIT
 */
/**
 * @module Watcher
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.LogWatcher = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fsExtra = require('fs-extra');

var _fsExtra2 = _interopRequireDefault(_fsExtra);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _raven = require('raven');

var _raven2 = _interopRequireDefault(_raven);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var debug = (0, _debug2.default)('ed-logwatcher');

_raven2.default.config('https://8f7736c757ed4d2882fc24a2846d1ce8:adbedad11d84421097182d6713727606@sentry.io/226655', {
	release: require('../package.json').version,
	autoBreadcrumbs: true
}).install();

/**
 * Interval in MS to poll directory at.
 * @type {number}
 */
var POLL_INTERVAL = 1000;
/**
 * Default path to journal files for Elite.
 * @type {string}
 */
var DEFAULT_SAVE_DIR = _path2.default.join(_os2.default.homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous');
/**
 * @class The main class.
 * @tutorial LogWatcher-Tutorial
 */

var LogWatcher = exports.LogWatcher = function (_events$EventEmitter) {
	_inherits(LogWatcher, _events$EventEmitter);

	/**
  * Construct the log watcher.
  * @param dirpath {string} The directory to watch.
  * @param maxfiles {number} Maximum amount of files to process.
  */
	function LogWatcher(dirpath, maxfiles) {
		_classCallCheck(this, LogWatcher);

		var _this = _possibleConstructorReturn(this, (LogWatcher.__proto__ || Object.getPrototypeOf(LogWatcher)).call(this));

		_this._dirpath = dirpath || DEFAULT_SAVE_DIR;
		_this._filter = isCommanderLog;
		_this._maxfiles = maxfiles || 3;
		_this._logDetailMap = {};
		_this._ops = [];
		_this._op = null;
		_this._timer = null;
		_this._die = false;

		_this._loop();
		return _this;
	}

	/**
  * Bury a file
  * @param filename {string} File to bury.
  */


	_createClass(LogWatcher, [{
		key: 'bury',
		value: function bury(filename) {
			debug('bury', { filename: filename });
			this._logDetailMap[filename].tombstoned = true;
		}

		/**
   * Stop running
   */

	}, {
		key: 'stop',
		value: function stop() {
			debug('stop');

			if (this._op === null) {
				clearTimeout(this._timer);
				this.emit('stopped');
			} else {
				this._ops.splice(this._ops.length);
				this._die = true;
			}
		}

		/**
   * The main loop
   */

	}, {
		key: '_loop',
		value: function _loop() {
			var _this2 = this;

			debug('_loop', { opcount: this._ops.length });

			this._op = null;

			if (this._ops.length === 0) {
				this._timer = setTimeout(function () {
					_this2._ops.push(function (callback) {
						return _this2._poll(callback);
					});
					setImmediate(function () {
						return _this2._loop();
					});
				}, POLL_INTERVAL);
				return;
			}

			this._op = this._ops.shift();

			try {
				this._op(function (err) {
					if (err) {
						_this2.emit('error', err);
					} else if (_this2._die) {
						_this2.emit('stopped');
					} else {
						setImmediate(function () {
							return _this2._loop();
						});
					}
				});
			} catch (err) {
				this.emit('error', err);
				// Assumption: it crashed BEFORE an async wait
				// otherwise, we'll end up with more simultaneous
				// activity
				setImmediate(function () {
					return _this2._loop();
				});
			}
		}

		/**
   * Poll the logs directory for new/updated files.
   * @param callback {function}
   */

	}, {
		key: '_poll',
		value: function _poll(callback) {
			var _this3 = this;

			debug('_poll');

			var unseen = {};
			Object.keys(this._logDetailMap).forEach(function (filename) {
				if (!_this3._logDetailMap[filename].tombstoned) {
					unseen[filename] = true;
				}
			});

			_fsExtra2.default.readdir(this._dirpath, function (err, filenames) {
				if (err) {
					callback(err);
				} else {
					var files = filenames.slice(filenames.length - _this3._maxfiles, filenames.length);
					files.forEach(function (filename) {
						filename = _path2.default.join(_this3._dirpath, filename);
						if (_this3._filter(filename)) {
							delete unseen[filename];
							_this3._ops.push(function (cb) {
								return _this3._statfile(filename, cb);
							});
						}
					});

					Object.keys(unseen).forEach(function (filename) {
						_this3.bury(filename);
					});

					callback(null);
				}
			});
		}

		/**
   * Stat the new/updated files in log directory
   * @param filename {string} Path to file to get stats of.
   * @param callback
   */

	}, {
		key: '_statfile',
		value: function _statfile(filename, callback) {
			var _this4 = this;

			debug('_statfile', { filename: filename });

			_fsExtra2.default.stat(filename, function (err, stats) {
				if (err && err.code === 'ENOENT') {
					if (_this4._logDetailMap[filename]) {
						_this4.bury(filename);
					}
					callback(null); // File deleted
				} else if (err) {
					callback(err);
				} else {
					_this4._ops.push(function (cb) {
						return _this4._process(filename, stats, cb);
					});
					callback(null);
				}
			});
		}

		/**
   * Process the files
   * @param filename {string} Filename to check
   * @param stats {object} Last modified etc
   * @param callback {function}
   */

	}, {
		key: '_process',
		value: function _process(filename, stats, callback) {
			var _this5 = this;

			debug('_process', { filename: filename, stats: stats });
			var CURRENT_FILE = 0;
			setImmediate(callback, null);
			var info = this._logDetailMap[filename];

			if (info === undefined && CURRENT_FILE < this._maxfiles) {
				this._logDetailMap[filename] = {
					ino: stats.ino,
					mtime: stats.mtime,
					size: stats.size,
					watermark: 0,
					tombstoned: false
				};
				CURRENT_FILE++;
				this._ops.push(function (cb) {
					return _this5._read(filename, cb);
				});
				return;
			}

			if (info.tombstoned) {
				return;
			}

			if (info.ino !== stats.ino) {
				// File replaced... can't trust it any more
				// if the client API supported replay from scratch, we could do that
				// but we can't yet, so:
				CURRENT_FILE = 0;
				this.bury(filename);
			} else if (stats.size > info.size) {
				// File not replaced; got longer... assume append
				this._ops.push(function (cb) {
					return _this5._read(filename, cb);
				});
			} else if (info.ino === stats.ino && info.size === stats.size) {
				// Even if mtime is different, treat it as unchanged
				// e.g. ^Z when COPY CON to a fake log
				// don't queue read
			}

			info.mtime = stats.mtime;
			info.size = stats.size;
		}

		/**
   * Read the files
   * @param filename {string} The filename to read.
   * @param callback {function}
   */

	}, {
		key: '_read',
		value: function _read(filename, callback) {
			var _this6 = this;

			var _logDetailMap$filenam = this._logDetailMap[filename],
			    watermark = _logDetailMap$filenam.watermark,
			    size = _logDetailMap$filenam.size;

			debug('_read', { filename: filename, watermark: watermark, size: size });
			var leftover = Buffer.from('', 'utf8');

			var s = _fsExtra2.default.createReadStream(filename, {
				flags: 'r',
				start: watermark,
				end: size
			});
			var finish = function finish(err) {
				if (err) {
					// On any error, emit the error and bury the file.
					_this6.emit('error', err);
					_this6.bury(filename);
				}
				setImmediate(callback, null);
				callback = function callback() {}; // No-op
			};
			s.once('error', finish);

			s.once('end', finish);

			s.on('data', function (chunk) {
				var sThis = _this6;
				_raven2.default.context(function () {
					_raven2.default.captureBreadcrumb({
						data: {
							chunk: chunk.toString()
						}
					});
					var idx = chunk.lastIndexOf('\n');
					if (idx < 0) {
						leftover = Buffer.concat([leftover, chunk]);
					} else {
						sThis._logDetailMap[filename].watermark += idx + 1;
						try {
							var obs = Buffer.concat([leftover, chunk.slice(0, idx + 1)]).toString('utf8').replace(/\u000e/igm, '').replace(/\u000f/igm, '').split(/[\r\n]+/).filter(function (l) {
								return l.length > 0;
							}).map(function (l) {
								try {
									return JSON.parse(l);
								} catch (e) {
									debug('json.parse error', { line: l });
									_raven2.default.context(function () {
										_raven2.default.captureBreadcrumb({
											message: 'File that crashed log watcher',
											data: {
												filename: filename
											}
										});
										_raven2.default.captureBreadcrumb({
											message: 'Log-watcher JSON.parse failed',
											data: {
												line: l,
												chunk: chunk.toString()
											}
										});
										_raven2.default.captureException(e);
									});
								}
							});
							leftover = chunk.slice(idx + 1);
							if (obs) {
								setImmediate(function () {
									return sThis.emit('data', obs) && sThis.emit('finished');
								});
							} else {
								setImmediate(function () {
									return sThis.emit('data', {}) && sThis.emit('finished');
								});
							}
						} catch (err) {
							finish(err);
						}
					}
				});
			});
		}
	}]);

	return LogWatcher;
}(_events2.default.EventEmitter);
/**
 * Get the path of the logs.
 * @param fpath {string} Path to check.
 * @returns {boolean} True if the directory contains journal files.
 */


function isCommanderLog(fpath) {
	var base = _path2.default.basename(fpath);
	return base.indexOf('Journal.') === 0 && _path2.default.extname(fpath) === '.log';
}

if (!module.parent) {
	process.on('uncaughtException', function (err) {
		console.error(err.stack || err);
		throw new Error(err.stack || err);
	});

	var watcher = new LogWatcher(DEFAULT_SAVE_DIR, 3);
	watcher.on('error', function (err) {
		watcher.stop();
		console.error(err.stack || err);
		throw new Error(err.stack || err);
	});
	watcher.on('data', function (obs) {
		obs.forEach(function (ob) {
			var timestamp = ob.timestamp,
			    event = ob.event;

			console.log('\n' + timestamp, event);
			delete ob.timestamp;
			delete ob.event;
			Object.keys(ob).sort().forEach(function (k) {
				// console.log('\t' + k, ob[k]);
			});
		});
	});
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2ctd2F0Y2hlci5qcyJdLCJuYW1lcyI6WyJkZWJ1ZyIsImNvbmZpZyIsInJlbGVhc2UiLCJyZXF1aXJlIiwidmVyc2lvbiIsImF1dG9CcmVhZGNydW1icyIsImluc3RhbGwiLCJQT0xMX0lOVEVSVkFMIiwiREVGQVVMVF9TQVZFX0RJUiIsImpvaW4iLCJob21lZGlyIiwiTG9nV2F0Y2hlciIsImRpcnBhdGgiLCJtYXhmaWxlcyIsIl9kaXJwYXRoIiwiX2ZpbHRlciIsImlzQ29tbWFuZGVyTG9nIiwiX21heGZpbGVzIiwiX2xvZ0RldGFpbE1hcCIsIl9vcHMiLCJfb3AiLCJfdGltZXIiLCJfZGllIiwiX2xvb3AiLCJmaWxlbmFtZSIsInRvbWJzdG9uZWQiLCJjbGVhclRpbWVvdXQiLCJlbWl0Iiwic3BsaWNlIiwibGVuZ3RoIiwib3Bjb3VudCIsInNldFRpbWVvdXQiLCJwdXNoIiwiX3BvbGwiLCJjYWxsYmFjayIsInNldEltbWVkaWF0ZSIsInNoaWZ0IiwiZXJyIiwidW5zZWVuIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJyZWFkZGlyIiwiZmlsZW5hbWVzIiwiZmlsZXMiLCJzbGljZSIsIl9zdGF0ZmlsZSIsImNiIiwiYnVyeSIsInN0YXQiLCJzdGF0cyIsImNvZGUiLCJfcHJvY2VzcyIsIkNVUlJFTlRfRklMRSIsImluZm8iLCJ1bmRlZmluZWQiLCJpbm8iLCJtdGltZSIsInNpemUiLCJ3YXRlcm1hcmsiLCJfcmVhZCIsImxlZnRvdmVyIiwiQnVmZmVyIiwiZnJvbSIsInMiLCJjcmVhdGVSZWFkU3RyZWFtIiwiZmxhZ3MiLCJzdGFydCIsImVuZCIsImZpbmlzaCIsIm9uY2UiLCJvbiIsInNUaGlzIiwiY29udGV4dCIsImNhcHR1cmVCcmVhZGNydW1iIiwiZGF0YSIsImNodW5rIiwidG9TdHJpbmciLCJpZHgiLCJsYXN0SW5kZXhPZiIsImNvbmNhdCIsIm9icyIsInJlcGxhY2UiLCJzcGxpdCIsImZpbHRlciIsImwiLCJtYXAiLCJKU09OIiwicGFyc2UiLCJlIiwibGluZSIsIm1lc3NhZ2UiLCJjYXB0dXJlRXhjZXB0aW9uIiwiRXZlbnRFbWl0dGVyIiwiZnBhdGgiLCJiYXNlIiwiYmFzZW5hbWUiLCJpbmRleE9mIiwiZXh0bmFtZSIsIm1vZHVsZSIsInBhcmVudCIsInByb2Nlc3MiLCJjb25zb2xlIiwiZXJyb3IiLCJzdGFjayIsIkVycm9yIiwid2F0Y2hlciIsInN0b3AiLCJ0aW1lc3RhbXAiLCJvYiIsImV2ZW50IiwibG9nIiwic29ydCJdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7O0FBS0E7OztBQUdBOzs7Ozs7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7Ozs7Ozs7OztBQUVBLElBQU1BLFFBQVEscUJBQU8sZUFBUCxDQUFkOztBQUVBLGdCQUFNQyxNQUFOLENBQWEsNEZBQWIsRUFBMkc7QUFDMUdDLFVBQVNDLFFBQVEsaUJBQVIsRUFBMkJDLE9BRHNFO0FBRTFHQyxrQkFBaUI7QUFGeUYsQ0FBM0csRUFHR0MsT0FISDs7QUFLQTs7OztBQUlBLElBQU1DLGdCQUFnQixJQUF0QjtBQUNBOzs7O0FBSUEsSUFBTUMsbUJBQW1CLGVBQUtDLElBQUwsQ0FDeEIsYUFBR0MsT0FBSCxFQUR3QixFQUV4QixhQUZ3QixFQUd4Qix1QkFId0IsRUFJeEIsaUJBSndCLENBQXpCO0FBTUE7Ozs7O0lBSWFDLFUsV0FBQUEsVTs7O0FBQ1o7Ozs7O0FBS0EscUJBQVlDLE9BQVosRUFBcUJDLFFBQXJCLEVBQStCO0FBQUE7O0FBQUE7O0FBRzlCLFFBQUtDLFFBQUwsR0FBZ0JGLFdBQVdKLGdCQUEzQjtBQUNBLFFBQUtPLE9BQUwsR0FBZUMsY0FBZjtBQUNBLFFBQUtDLFNBQUwsR0FBaUJKLFlBQVksQ0FBN0I7QUFDQSxRQUFLSyxhQUFMLEdBQXFCLEVBQXJCO0FBQ0EsUUFBS0MsSUFBTCxHQUFZLEVBQVo7QUFDQSxRQUFLQyxHQUFMLEdBQVcsSUFBWDtBQUNBLFFBQUtDLE1BQUwsR0FBYyxJQUFkO0FBQ0Es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RSxJQUFJbUUsS0FBSixJQUFhbkUsR0FBM0I7QUFDQSxRQUFNLElBQUlvRSxLQUFKLENBQVVwRSxJQUFJbUUsS0FBSixJQUFhbkUsR0FBdkIsQ0FBTjtBQUNBLEVBSkQ7QUFLQXFFLFNBQVFuQyxFQUFSLENBQVcsTUFBWCxFQUFtQixlQUFPO0FBQ3pCVSxNQUFJeEMsT0FBSixDQUFZLGNBQU07QUFBQSxPQUNWbUUsU0FEVSxHQUNVQyxFQURWLENBQ1ZELFNBRFU7QUFBQSxPQUNDRSxLQURELEdBQ1VELEVBRFYsQ0FDQ0MsS0FERDs7QUFFakJSLFdBQVFTLEdBQVIsQ0FBWSxPQUFPSCxTQUFuQixFQUE4QkUsS0FBOUI7QUFDQSxVQUFPRCxHQUFHRCxTQUFWO0FBQ0EsVUFBT0MsR0FBR0MsS0FBVjtBQUNBdkUsVUFBT0MsSUFBUCxDQUFZcUUsRUFBWixFQUFnQkcsSUFBaEIsR0FBdUJ2RSxPQUF2QixDQUErQixhQUFLO0FBQ25DO0FBQ0EsSUFGRDtBQUdBLEdBUkQ7QUFTQSxFQVZEO0FBV0EiLCJmaWxlIjoibG9nLXdhdGNoZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBmaWxlIFRoZSBmaWxlIHRoYXQgZG9lcyB0aGUgd2F0Y2hlciBwcm9jZXNzaW5nLlxuICogQGF1dGhvciB3aWxseWIzMjFcbiAqIEBjb3B5cmlnaHQgTUlUXG4gKi9cbi8qKlxuICogQG1vZHVsZSBXYXRjaGVyXG4gKi9cbid1c2Ugc3RyaWN0JztcbmltcG9ydCBldmVudHMgZnJvbSAnZXZlbnRzJztcbmltcG9ydCBvcyBmcm9tICdvcyc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCBmcyBmcm9tICdmcy1leHRyYSc7XG5pbXBvcnQgZGVidWcwIGZyb20gJ2RlYnVnJztcbmltcG9ydCBSYXZlbiBmcm9tICdyYXZlbic7XG5cbmNvbnN0IGRlYnVnID0gZGVidWcwKCdlZC1sb2d3YXRjaGVyJyk7XG5cblJhdmVuLmNvbmZpZygnaHR0cHM6Ly84Zjc3MzZjNzU3ZWQ0ZDI4ODJmYzI0YTI4NDZkMWNlODphZGJlZGFkMTFkODQ0MjEwOTcxODJkNjcxMzcyNzYwNkBzZW50cnkuaW8vMjI2NjU1Jywge1xuXHRyZWxlYXNlOiByZXF1aXJlKCcuLi9wYWNrYWdlLmpzb24nKS52ZXJzaW9uLFxuXHRhdXRvQnJlYWRjcnVtYnM6IHRydWVcbn0pLmluc3RhbGwoKTtcblxuLyoqXG4gKiBJbnRlcnZhbCBpbiBNUyB0byBwb2xsIGRpcmVjdG9yeSBhdC5cbiAqIEB0eXBlIHtudW1iZXJ9XG4gKi9cbmNvbnN0IFBPTExfSU5URVJWQUwgPSAxMDAwO1xuLyoqXG4gKiBEZWZhdWx0IHBhdGggdG8gam91cm5hbCBmaWxlcyBmb3IgRWxpdGUuXG4gKiBAdHlwZSB7c3RyaW5nfVxuICovXG5jb25zdCBERUZBVUxUX1NBVkVfRElSID0gcGF0aC5qb2luKFxuXHRvcy5ob21lZGlyKCksXG5cdCdTYXZlZCBHYW1lcycsXG5cdCdGcm9udGllciBEZXZlbG9wbWVudHMnLFxuXHQnRWxpdGUgRGFuZ2Vyb3VzJ1xuKTtcbi8qKlxuICogQGNsYXNzIFRoZSBtYWluIGNsYXNzLlxuICogQHR1dG9yaWFsIExvZ1dhdGNoZXItVHV0b3JpYWxcbiAqL1xuZXhwb3J0IGNsYXNzIExvZ1dhdGNoZXIgZXh0ZW5kcyBldmVudHMuRXZlbnRFbWl0dGVyIHtcblx0LyoqXG5cdCAqIENvbnN0cnVjdCB0aGUgbG9nIHdhdGNoZXIuXG5cdCAqIEBwYXJhbSBkaXJwYXRoIHtzdHJpbmd9IFRoZSBkaXJlY3RvcnkgdG8gd2F0Y2guXG5cdCAqIEBwYXJhbSBtYXhmaWxlcyB7bnVtYmVyfSBNYXhpbXVtIGFtb3VudCBvZiBmaWxlcyB0byBwcm9jZXNzLlxuXHQgKi9cblx0Y29uc3RydWN0b3IoZGlycGF0aCwgbWF4ZmlsZXMpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZGlycGF0aCA9IGRpcnBhdGggfHwgREVGQVVMVF9TQVZFX0RJUjtcblx0XHR0aGlzLl9maWx0ZXIgPSBpc0NvbW1hbmRlckxvZztcblx0XHR0aGlzLl9tYXhmaWxlcyA9IG1heGZpbGVzIHx8IDM7XG5cdFx0dGhpcy5fbG9nRGV0YWlsTWFwID0ge307XG5cdFx0dGhpcy5fb3BzID0gW107XG5cdFx0dGhpcy5fb3AgPSBudWxsO1xuXHRcdHRoaXMuX3RpbWVyID0gbnVsbDtcblx0XHR0aGlzLl9kaWUgPSBmYWxzZTtcblxuXHRcdHRoaXMuX2xvb3AoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdXJ5IGEgZmlsZVxuXHQgKiBAcGFyYW0gZmlsZW5hbWUge3N0cmluZ30gRmlsZSB0byBidXJ5LlxuXHQgKi9cblx0YnVyeShmaWxlbmFtZSkge1xuXHRcdGRlYnVnKCdidXJ5Jywge2ZpbGVuYW1lfSk7XG5cdFx0dGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXS50b21ic3RvbmVkID0gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdG9wIHJ1bm5pbmdcblx0ICovXG5cdHN0b3AoKSB7XG5cdFx0ZGVidWcoJ3N0b3AnKTtcblxuXHRcdGlmICh0aGlzLl9vcCA9PT0gbnVsbCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3RpbWVyKTtcblx0XHRcdHRoaXMuZW1pdCgnc3RvcHBlZCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vcHMuc3BsaWNlKHRoaXMuX29wcy5sZW5ndGgpO1xuXHRcdFx0dGhpcy5fZGllID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVGhlIG1haW4gbG9vcFxuXHQgKi9cblx0X2xvb3AoKSB7XG5cdFx0ZGVidWcoJ19sb29wJywge29wY291bnQ6IHRoaXMuX29wcy5sZW5ndGh9KTtcblxuXHRcdHRoaXMuX29wID0gbnVsbDtcblxuXHRcdGlmICh0aGlzLl9vcHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl90aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vcHMucHVzaChjYWxsYmFjayA9PiB0aGlzLl9wb2xsKGNhbGxiYWNrKSk7XG5cdFx0XHRcdHNldEltbWVkaWF0ZSgoKSA9PiB0aGlzLl9sb29wKCkpO1xuXHRcdFx0fSwgUE9MTF9JTlRFUlZBTCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fb3AgPSB0aGlzLl9vcHMuc2hpZnQoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9vcChlcnIgPT4ge1xuXHRcdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5lbWl0KCdlcnJvcicsIGVycik7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fZGllKSB7XG5cdFx0XHRcdFx0dGhpcy5lbWl0KCdzdG9wcGVkJyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuX2xvb3AoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5lbWl0KCdlcnJvcicsIGVycik7XG5cdFx0XHRcdC8vIEFzc3VtcHRpb246IGl0IGNyYXNoZWQgQkVGT1JFIGFuIGFzeW5jIHdhaXRcblx0XHRcdFx0Ly8gb3RoZXJ3aXNlLCB3ZSdsbCBlbmQgdXAgd2l0aCBtb3JlIHNpbXVsdGFuZW91c1xuXHRcdFx0XHQvLyBhY3Rpdml0eVxuXHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuX2xvb3AoKSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFBvbGwgdGhlIGxvZ3MgZGlyZWN0b3J5IGZvciBuZXcvdXBkYXRlZCBmaWxlcy5cblx0ICogQHBhcmFtIGNhbGxiYWNrIHtmdW5jdGlvbn1cblx0ICovXG5cdF9wb2xsKGNhbGxiYWNrKSB7XG5cdFx0ZGVidWcoJ19wb2xsJyk7XG5cblx0XHRjb25zdCB1bnNlZW4gPSB7fTtcblx0XHRPYmplY3Qua2V5cyh0aGlzLl9sb2dEZXRhaWxNYXApLmZvckVhY2goZmlsZW5hbWUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdLnRvbWJzdG9uZWQpIHtcblx0XHRcdFx0dW5zZWVuW2ZpbGVuYW1lXSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRmcy5yZWFkZGlyKHRoaXMuX2RpcnBhdGgsIChlcnIsIGZpbGVuYW1lcykgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRjYWxsYmFjayhlcnIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZmlsZXMgPSBmaWxlbmFtZXMuc2xpY2UoZmlsZW5hbWVzLmxlbmd0aCAtIHRoaXMuX21heGZpbGVzLCBmaWxlbmFtZXMubGVuZ3RoKTtcblx0XHRcdFx0ZmlsZXMuZm9yRWFjaChmaWxlbmFtZSA9PiB7XG5cdFx0XHRcdFx0ZmlsZW5hbWUgPSBwYXRoLmpvaW4odGhpcy5fZGlycGF0aCwgZmlsZW5hbWUpO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9maWx0ZXIoZmlsZW5hbWUpKSB7XG5cdFx0XHRcdFx0XHRkZWxldGUgdW5zZWVuW2ZpbGVuYW1lXTtcblx0XHRcdFx0XHRcdHRoaXMuX29wcy5wdXNoKGNiID0+IHRoaXMuX3N0YXRmaWxlKGZpbGVuYW1lLCBjYikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0T2JqZWN0LmtleXModW5zZWVuKS5mb3JFYWNoKGZpbGVuYW1lID0+IHtcblx0XHRcdFx0XHR0aGlzLmJ1cnkoZmlsZW5hbWUpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjYWxsYmFjayhudWxsKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdGF0IHRoZSBuZXcvdXBkYXRlZCBmaWxlcyBpbiBsb2cgZGlyZWN0b3J5XG5cdCAqIEBwYXJhbSBmaWxlbmFtZSB7c3RyaW5nfSBQYXRoIHRvIGZpbGUgdG8gZ2V0IHN0YXRzIG9mLlxuXHQgKiBAcGFyYW0gY2FsbGJhY2tcblx0ICovXG5cdF9zdGF0ZmlsZShmaWxlbmFtZSwgY2FsbGJhY2spIHtcblx0XHRkZWJ1ZygnX3N0YXRmaWxlJywge2ZpbGVuYW1lfSk7XG5cblx0XHRmcy5zdGF0KGZpbGVuYW1lLCAoZXJyLCBzdGF0cykgPT4ge1xuXHRcdFx0aWYgKGVyciAmJiBlcnIuY29kZSA9PT0gJ0VOT0VOVCcpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0pIHtcblx0XHRcdFx0XHR0aGlzLmJ1cnkoZmlsZW5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwpOyAvLyBGaWxlIGRlbGV0ZWRcblx0XHRcdH0gZWxzZSBpZiAoZXJyKSB7XG5cdFx0XHRcdGNhbGxiYWNrKGVycik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9vcHMucHVzaChjYiA9PiB0aGlzLl9wcm9jZXNzKGZpbGVuYW1lLCBzdGF0cywgY2IpKTtcblx0XHRcdFx0Y2FsbGJhY2sobnVsbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUHJvY2VzcyB0aGUgZmlsZXNcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IEZpbGVuYW1lIHRvIGNoZWNrXG5cdCAqIEBwYXJhbSBzdGF0cyB7b2JqZWN0fSBMYXN0IG1vZGlmaWVkIGV0Y1xuXHQgKiBAcGFyYW0gY2FsbGJhY2sge2Z1bmN0aW9ufVxuXHQgKi9cblx0X3Byb2Nlc3MoZmlsZW5hbWUsIHN0YXRzLCBjYWxsYmFjaykge1xuXHRcdGRlYnVnKCdfcHJvY2VzcycsIHtmaWxlbmFtZSwgc3RhdHN9KTtcblx0XHRsZXQgQ1VSUkVOVF9GSUxFID0gMDtcblx0XHRzZXRJbW1lZGlhdGUoY2FsbGJhY2ssIG51bGwpO1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdO1xuXG5cdFx0aWYgKGluZm8gPT09IHVuZGVmaW5lZCAmJiBDVVJSRU5UX0ZJTEUgPCB0aGlzLl9tYXhmaWxlcykge1xuXHRcdFx0dGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXSA9IHtcblx0XHRcdFx0aW5vOiBzdGF0cy5pbm8sXG5cdFx0XHRcdG10aW1lOiBzdGF0cy5tdGltZSxcblx0XHRcdFx0c2l6ZTogc3RhdHMuc2l6ZSxcblx0XHRcdFx0d2F0ZXJtYXJrOiAwLFxuXHRcdFx0XHR0b21ic3RvbmVkOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdENVUlJFTlRfRklMRSsrO1xuXHRcdFx0dGhpcy5fb3BzLnB1c2goY2IgPT4gdGhpcy5fcmVhZChmaWxlbmFtZSwgY2IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaW5mby50b21ic3RvbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGluZm8uaW5vICE9PSBzdGF0cy5pbm8pIHtcblx0XHRcdFx0Ly8gRmlsZSByZXBsYWNlZC4uLiBjYW4ndCB0cnVzdCBpdCBhbnkgbW9yZVxuXHRcdFx0XHQvLyBpZiB0aGUgY2xpZW50IEFQSSBzdXBwb3J0ZWQgcmVwbGF5IGZyb20gc2NyYXRjaCwgd2UgY291bGQgZG8gdGhhdFxuXHRcdFx0XHQvLyBidXQgd2UgY2FuJ3QgeWV0LCBzbzpcblx0XHRcdENVUlJFTlRfRklMRSA9IDA7XG5cdFx0XHR0aGlzLmJ1cnkoZmlsZW5hbWUpO1xuXHRcdH0gZWxzZSBpZiAoc3RhdHMuc2l6ZSA+IGluZm8uc2l6ZSkge1xuXHRcdFx0XHQvLyBGaWxlIG5vdCByZXBsYWNlZDsgZ290IGxvbmdlci4uLiBhc3N1bWUgYXBwZW5kXG5cdFx0XHR0aGlzLl9vcHMucHVzaChjYiA9PiB0aGlzLl9yZWFkKGZpbGVuYW1lLCBjYikpO1xuXHRcdH0gZWxzZSBpZiAoaW5mby5pbm8gPT09IHN0YXRzLmlubyAmJiBpbmZvLnNpemUgPT09IHN0YXRzLnNpemUpIHtcblx0XHRcdFx0Ly8gRXZlbiBpZiBtdGltZSBpcyBkaWZmZXJlbnQsIHRyZWF0IGl0IGFzIHVuY2hhbmdlZFxuXHRcdFx0XHQvLyBlLmcuIF5aIHdoZW4gQ09QWSBDT04gdG8gYSBmYWtlIGxvZ1xuXHRcdFx0XHQvLyBkb24ndCBxdWV1ZSByZWFkXG5cdFx0fVxuXG5cdFx0aW5mby5tdGltZSA9IHN0YXRzLm10aW1lO1xuXHRcdGluZm8uc2l6ZSA9IHN0YXRzLnNpemU7XG5cdH1cblxuXHQvKipcblx0ICogUmVhZCB0aGUgZmlsZXNcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IFRoZSBmaWxlbmFtZSB0byByZWFkLlxuXHQgKiBAcGFyYW0gY2FsbGJhY2sge2Z1bmN0aW9ufVxuXHQgKi9cblx0X3JlYWQoZmlsZW5hbWUsIGNhbGxiYWNrKSB7XG5cdFx0Y29uc3Qge3dhdGVybWFyaywgc2l6ZX0gPSB0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdO1xuXHRcdGRlYnVnKCdfcmVhZCcsIHtmaWxlbmFtZSwgd2F0ZXJtYXJrLCBzaXplfSk7XG5cdFx0bGV0IGxlZnRvdmVyID0gQnVmZmVyLmZyb20oJycsICd1dGY4Jyk7XG5cblx0XHRjb25zdCBzID0gZnMuY3JlYXRlUmVhZFN0cmVhbShmaWxlbmFtZSwge1xuXHRcdFx0ZmxhZ3M6ICdyJyxcblx0XHRcdHN0YXJ0OiB3YXRlcm1hcmssXG5cdFx0XHRlbmQ6IHNpemVcblx0XHR9KTtcblx0XHRjb25zdCBmaW5pc2ggPSBlcnIgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdC8vIE9uIGFueSBlcnJvciwgZW1pdCB0aGUgZXJyb3IgYW5kIGJ1cnkgdGhlIGZpbGUuXG5cdFx0XHRcdHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xuXHRcdFx0XHR0aGlzLmJ1cnkoZmlsZW5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0c2V0SW1tZWRpYXRlKGNhbGxiYWNrLCBudWxsKTtcblx0XHRcdGNhbGxiYWNrID0gKCkgPT4ge1xuXHRcdFx0fTsgLy8gTm8tb3Bcblx0XHR9O1xuXHRcdHMub25jZSgnZXJyb3InLCBmaW5pc2gpO1xuXG5cdFx0cy5vbmNlKCdlbmQnLCBmaW5pc2gpO1xuXG5cdFx0cy5vbignZGF0YScsIGNodW5rID0+IHtcblx0XHRcdGNvbnN0IHNUaGlzID0gdGhpcztcblx0XHRcdFJhdmVuLmNvbnRleHQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRSYXZlbi5jYXB0dXJlQnJlYWRjcnVtYih7XG5cdFx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdFx0Y2h1bms6IGNodW5rLnRvU3RyaW5nKClcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBpZHggPSBjaHVuay5sYXN0SW5kZXhPZignXFxuJyk7XG5cdFx0XHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRcdFx0bGVmdG92ZXIgPSBCdWZmZXIuY29uY2F0KFtsZWZ0b3ZlciwgY2h1bmtdKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzVGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXS53YXRlcm1hcmsgKz0gaWR4ICsgMTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgb2JzID0gQnVmZmVyLmNvbmNhdChbbGVmdG92ZXIsIGNodW5rLnNsaWNlKDAsIGlkeCArIDEpXSlcblx0XHRcdFx0XHRcdFx0LnRvU3RyaW5nKCd1dGY4Jylcblx0XHRcdFx0XHRcdFx0LnJlcGxhY2UoL1xcdTAwMGUvaWdtLCAnJylcblx0XHRcdFx0XHRcdFx0LnJlcGxhY2UoL1xcdTAwMGYvaWdtLCAnJylcblx0XHRcdFx0XHRcdFx0LnNwbGl0KC9bXFxyXFxuXSsvKVxuXHRcdFx0XHRcdFx0XHQuZmlsdGVyKGwgPT4gbC5sZW5ndGggPiAwKVxuXHRcdFx0XHRcdFx0XHQubWFwKGwgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShsKVxuXHRcdFx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGRlYnVnKCdqc29uLnBhcnNlIGVycm9yJywge2xpbmU6IGx9KTtcblx0XHRcdFx0XHRcdFx0XHRcdFJhdmVuLmNvbnRleHQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRSYXZlbi5jYXB0dXJlQnJlYWRjcnVtYih7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0bWVzc2FnZTogJ0ZpbGUgdGhhdCBjcmFzaGVkIGxvZyB3YXRjaGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRmaWxlbmFtZVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFJhdmVuLmNhcHR1cmVCcmVhZGNydW1iKHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlOiAnTG9nLXdhdGNoZXIgSlNPTi5wYXJzZSBmYWlsZWQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGxpbmU6IGwsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjaHVuazogY2h1bmsudG9TdHJpbmcoKVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFJhdmVuLmNhcHR1cmVFeGNlcHRpb24oZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRsZWZ0b3ZlciA9IGNodW5rLnNsaWNlKGlkeCArIDEpO1xuXHRcdFx0XHRcdFx0aWYgKG9icykge1xuXHRcdFx0XHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gc1RoaXMuZW1pdCgnZGF0YScsIG9icykgJiYgc1RoaXMuZW1pdCgnZmluaXNoZWQnKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gc1RoaXMuZW1pdCgnZGF0YScsIHt9KSAmJiBzVGhpcy5lbWl0KCdmaW5pc2hlZCcpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdGZpbmlzaChlcnIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblx0fVxuLyoqXG4gKiBHZXQgdGhlIHBhdGggb2YgdGhlIGxvZ3MuXG4gKiBAcGFyYW0gZnBhdGgge3N0cmluZ30gUGF0aCB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSBkaXJlY3RvcnkgY29udGFpbnMgam91cm5hbCBmaWxlcy5cbiAqL1xuZnVuY3Rpb24gaXNDb21tYW5kZXJMb2coZnBhdGgpIHtcblx0Y29uc3QgYmFzZSA9IHBhdGguYmFzZW5hbWUoZnBhdGgpO1xuXHRyZXR1cm4gYmFzZS5pbmRleE9mKCdKb3VybmFsLicpID09PSAwICYmIHBhdGguZXh0bmFtZShmcGF0aCkgPT09ICcubG9nJztcbn1cblxuaWYgKCFtb2R1bGUucGFyZW50KSB7XG5cdHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgZXJyID0+IHtcblx0XHRjb25zb2xlLmVycm9yKGVyci5zdGFjayB8fCBlcnIpO1xuXHRcdHRocm93IG5ldyBFcnJvcihlcnIuc3RhY2sgfHwgZXJyKTtcblx0fSk7XG5cblx0Y29uc3Qgd2F0Y2hlciA9IG5ldyBMb2dXYXRjaGVyKERFRkFVTFRfU0FWRV9ESVIsIDMpO1xuXHR3YXRjaGVyLm9uKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0d2F0Y2hlci5zdG9wKCk7XG5cdFx0Y29uc29sZS5lcnJvcihlcnIuc3RhY2sgfHwgZXJyKTtcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XG5cdH0pO1xuXHR3YXRjaGVyLm9uKCdkYXRhJywgb2JzID0+IHtcblx0XHRvYnMuZm9yRWFjaChvYiA9PiB7XG5cdFx0XHRjb25zdCB7dGltZXN0YW1wLCBldmVudH0gPSBvYjtcblx0XHRcdGNvbnNvbGUubG9nKCdcXG4nICsgdGltZXN0YW1wLCBldmVudCk7XG5cdFx0XHRkZWxldGUgb2IudGltZXN0YW1wO1xuXHRcdFx0ZGVsZXRlIG9iLmV2ZW50O1xuXHRcdFx0T2JqZWN0LmtleXMob2IpLnNvcnQoKS5mb3JFYWNoKGsgPT4ge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnXFx0JyArIGssIG9iW2tdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn1cbiJdfQ==
