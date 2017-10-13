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
	release: !module.parent ? require('../package').version : require('electron').app.getVersion(),
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
 * @class
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
		// obs.forEach(ob => {
		// 	const {timestamp, event} = ob;
		// 	console.log('\n' + timestamp, event);
		// 	delete ob.timestamp;
		// 	delete ob.event;
		// 	Object.keys(ob).sort().forEach(k => {
		// 		// console.log('\t' + k, ob[k]);
		// 	});
		// });
	});
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2ctd2F0Y2hlci5qcyJdLCJuYW1lcyI6WyJkZWJ1ZyIsImNvbmZpZyIsInJlbGVhc2UiLCJtb2R1bGUiLCJwYXJlbnQiLCJyZXF1aXJlIiwidmVyc2lvbiIsImFwcCIsImdldFZlcnNpb24iLCJhdXRvQnJlYWRjcnVtYnMiLCJpbnN0YWxsIiwiUE9MTF9JTlRFUlZBTCIsIkRFRkFVTFRfU0FWRV9ESVIiLCJqb2luIiwiaG9tZWRpciIsIkxvZ1dhdGNoZXIiLCJkaXJwYXRoIiwibWF4ZmlsZXMiLCJfZGlycGF0aCIsIl9maWx0ZXIiLCJpc0NvbW1hbmRlckxvZyIsIl9tYXhmaWxlcyIsIl9sb2dEZXRhaWxNYXAiLCJfb3BzIiwiX29wIiwiX3RpbWVyIiwiX2RpZSIsIl9sb29wIiwiZmlsZW5hbWUiLCJ0b21ic3RvbmVkIiwiY2xlYXJUaW1lb3V0IiwiZW1pdCIsInNwbGljZSIsImxlbmd0aCIsIm9wY291bnQiLCJzZXRUaW1lb3V0IiwicHVzaCIsIl9wb2xsIiwiY2FsbGJhY2siLCJzZXRJbW1lZGlhdGUiLCJzaGlmdCIsImVyciIsInVuc2VlbiIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwicmVhZGRpciIsImZpbGVuYW1lcyIsImZpbGVzIiwic2xpY2UiLCJfc3RhdGZpbGUiLCJjYiIsImJ1cnkiLCJzdGF0Iiwic3RhdHMiLCJjb2RlIiwiX3Byb2Nlc3MiLCJDVVJSRU5UX0ZJTEUiLCJpbmZvIiwidW5kZWZpbmVkIiwiaW5vIiwibXRpbWUiLCJzaXplIiwid2F0ZXJtYXJrIiwiX3JlYWQiLCJsZWZ0b3ZlciIsIkJ1ZmZlciIsImZyb20iLCJzIiwiY3JlYXRlUmVhZFN0cmVhbSIsImZsYWdzIiwic3RhcnQiLCJlbmQiLCJmaW5pc2giLCJvbmNlIiwib24iLCJzVGhpcyIsImNvbnRleHQiLCJjYXB0dXJlQnJlYWRjcnVtYiIsImRhdGEiLCJjaHVuayIsInRvU3RyaW5nIiwiaWR4IiwibGFzdEluZGV4T2YiLCJjb25jYXQiLCJvYnMiLCJyZXBsYWNlIiwic3BsaXQiLCJmaWx0ZXIiLCJsIiwibWFwIiwiSlNPTiIsInBhcnNlIiwiZSIsImxpbmUiLCJtZXNzYWdlIiwiY2FwdHVyZUV4Y2VwdGlvbiIsIkV2ZW50RW1pdHRlciIsImZwYXRoIiwiYmFzZSIsImJhc2VuYW1lIiwiaW5kZXhPZiIsImV4dG5hbWUiLCJwcm9jZXNzIiwiY29uc29sZSIsImVycm9yIiwic3RhY2siLCJFcnJvciIsIndhdGNoZXIiLCJzdG9wIl0sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7QUFLQTs7O0FBR0E7Ozs7Ozs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7Ozs7Ozs7Ozs7O0FBRUEsSUFBTUEsUUFBUSxxQkFBTyxlQUFQLENBQWQ7O0FBRUEsZ0JBQU1DLE1BQU4sQ0FBYSw0RkFBYixFQUEyRztBQUMxR0MsVUFBVSxDQUFDQyxPQUFPQyxNQUFSLEdBQWlCQyxRQUFRLFlBQVIsRUFBc0JDLE9BQXZDLEdBQWlERCxRQUFRLFVBQVIsRUFBb0JFLEdBQXBCLENBQXdCQyxVQUF4QixFQUQrQztBQUUxR0Msa0JBQWlCO0FBRnlGLENBQTNHLEVBR0dDLE9BSEg7O0FBS0E7Ozs7QUFJQSxJQUFNQyxnQkFBZ0IsSUFBdEI7QUFDQTs7OztBQUlBLElBQU1DLG1CQUFtQixlQUFLQyxJQUFMLENBQ3hCLGFBQUdDLE9BQUgsRUFEd0IsRUFFeEIsYUFGd0IsRUFHeEIsdUJBSHdCLEVBSXhCLGlCQUp3QixDQUF6QjtBQU1BOzs7O0lBR2FDLFUsV0FBQUEsVTs7O0FBQ1o7Ozs7O0FBS0EscUJBQVlDLE9BQVosRUFBcUJDLFFBQXJCLEVBQStCO0FBQUE7O0FBQUE7O0FBRzlCLFFBQUtDLFFBQUwsR0FBZ0JGLFdBQVdKLGdCQUEzQjtBQUNBLFFBQUtPLE9BQUwsR0FBZUMsY0FBZjtBQUNBLFFBQUtDLFNBQUwsR0FBaUJKLFlBQVksQ0FBN0I7QUFDQSxRQUFLSyxhQUFMLEdBQXFCLEVBQXJCO0FBQ0EsUUFBS0MsSUFBTCxHQUFZLEVBQVo7QUFDQSxR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LEVBQW9CLGVBQU87QUFDMUJpQyxVQUFRQyxJQUFSO0FBQ0FMLFVBQVFDLEtBQVIsQ0FBY2hFLElBQUlpRSxLQUFKLElBQWFqRSxHQUEzQjtBQUNBLFFBQU0sSUFBSWtFLEtBQUosQ0FBVWxFLElBQUlpRSxLQUFKLElBQWFqRSxHQUF2QixDQUFOO0FBQ0EsRUFKRDtBQUtBbUUsU0FBUWpDLEVBQVIsQ0FBVyxNQUFYLEVBQW1CLGVBQU87QUFDekI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFWRDtBQVdBIiwiZmlsZSI6ImxvZy13YXRjaGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAZmlsZSBUaGUgZmlsZSB0aGF0IGRvZXMgdGhlIHdhdGNoZXIgcHJvY2Vzc2luZy5cbiAqIEBhdXRob3Igd2lsbHliMzIxXG4gKiBAY29weXJpZ2h0IE1JVFxuICovXG4vKipcbiAqIEBtb2R1bGUgV2F0Y2hlclxuICovXG4ndXNlIHN0cmljdCc7XG5pbXBvcnQgZXZlbnRzIGZyb20gJ2V2ZW50cyc7XG5pbXBvcnQgb3MgZnJvbSAnb3MnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgZnMgZnJvbSAnZnMtZXh0cmEnO1xuaW1wb3J0IGRlYnVnMCBmcm9tICdkZWJ1Zyc7XG5pbXBvcnQgUmF2ZW4gZnJvbSAncmF2ZW4nO1xuXG5jb25zdCBkZWJ1ZyA9IGRlYnVnMCgnZWQtbG9nd2F0Y2hlcicpO1xuXG5SYXZlbi5jb25maWcoJ2h0dHBzOi8vOGY3NzM2Yzc1N2VkNGQyODgyZmMyNGEyODQ2ZDFjZTg6YWRiZWRhZDExZDg0NDIxMDk3MTgyZDY3MTM3Mjc2MDZAc2VudHJ5LmlvLzIyNjY1NScsIHtcblx0cmVsZWFzZTogKCFtb2R1bGUucGFyZW50ID8gcmVxdWlyZSgnLi4vcGFja2FnZScpLnZlcnNpb24gOiByZXF1aXJlKCdlbGVjdHJvbicpLmFwcC5nZXRWZXJzaW9uKCkpLFxuXHRhdXRvQnJlYWRjcnVtYnM6IHRydWVcbn0pLmluc3RhbGwoKTtcblxuLyoqXG4gKiBJbnRlcnZhbCBpbiBNUyB0byBwb2xsIGRpcmVjdG9yeSBhdC5cbiAqIEB0eXBlIHtudW1iZXJ9XG4gKi9cbmNvbnN0IFBPTExfSU5URVJWQUwgPSAxMDAwO1xuLyoqXG4gKiBEZWZhdWx0IHBhdGggdG8gam91cm5hbCBmaWxlcyBmb3IgRWxpdGUuXG4gKiBAdHlwZSB7c3RyaW5nfVxuICovXG5jb25zdCBERUZBVUxUX1NBVkVfRElSID0gcGF0aC5qb2luKFxuXHRvcy5ob21lZGlyKCksXG5cdCdTYXZlZCBHYW1lcycsXG5cdCdGcm9udGllciBEZXZlbG9wbWVudHMnLFxuXHQnRWxpdGUgRGFuZ2Vyb3VzJ1xuKTtcbi8qKlxuICogQGNsYXNzXG4gKi9cbmV4cG9ydCBjbGFzcyBMb2dXYXRjaGVyIGV4dGVuZHMgZXZlbnRzLkV2ZW50RW1pdHRlciB7XG5cdC8qKlxuXHQgKiBDb25zdHJ1Y3QgdGhlIGxvZyB3YXRjaGVyLlxuXHQgKiBAcGFyYW0gZGlycGF0aCB7c3RyaW5nfSBUaGUgZGlyZWN0b3J5IHRvIHdhdGNoLlxuXHQgKiBAcGFyYW0gbWF4ZmlsZXMge251bWJlcn0gTWF4aW11bSBhbW91bnQgb2YgZmlsZXMgdG8gcHJvY2Vzcy5cblx0ICovXG5cdGNvbnN0cnVjdG9yKGRpcnBhdGgsIG1heGZpbGVzKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2RpcnBhdGggPSBkaXJwYXRoIHx8IERFRkFVTFRfU0FWRV9ESVI7XG5cdFx0dGhpcy5fZmlsdGVyID0gaXNDb21tYW5kZXJMb2c7XG5cdFx0dGhpcy5fbWF4ZmlsZXMgPSBtYXhmaWxlcyB8fCAzO1xuXHRcdHRoaXMuX2xvZ0RldGFpbE1hcCA9IHt9O1xuXHRcdHRoaXMuX29wcyA9IFtdO1xuXHRcdHRoaXMuX29wID0gbnVsbDtcblx0XHR0aGlzLl90aW1lciA9IG51bGw7XG5cdFx0dGhpcy5fZGllID0gZmFsc2U7XG5cblx0XHR0aGlzLl9sb29wKCk7XG5cdH1cblxuXHQvKipcblx0ICogQnVyeSBhIGZpbGVcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IEZpbGUgdG8gYnVyeS5cblx0ICovXG5cdGJ1cnkoZmlsZW5hbWUpIHtcblx0XHRkZWJ1ZygnYnVyeScsIHtmaWxlbmFtZX0pO1xuXHRcdHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0udG9tYnN0b25lZCA9IHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogU3RvcCBydW5uaW5nXG5cdCAqL1xuXHRzdG9wKCkge1xuXHRcdGRlYnVnKCdzdG9wJyk7XG5cblx0XHRpZiAodGhpcy5fb3AgPT09IG51bGwpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl90aW1lcik7XG5cdFx0XHR0aGlzLmVtaXQoJ3N0b3BwZWQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fb3BzLnNwbGljZSh0aGlzLl9vcHMubGVuZ3RoKTtcblx0XHRcdHRoaXMuX2RpZSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBtYWluIGxvb3Bcblx0ICovXG5cdF9sb29wKCkge1xuXHRcdGRlYnVnKCdfbG9vcCcsIHtvcGNvdW50OiB0aGlzLl9vcHMubGVuZ3RofSk7XG5cblx0XHR0aGlzLl9vcCA9IG51bGw7XG5cblx0XHRpZiAodGhpcy5fb3BzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fb3BzLnB1c2goY2FsbGJhY2sgPT4gdGhpcy5fcG9sbChjYWxsYmFjaykpO1xuXHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gdGhpcy5fbG9vcCgpKTtcblx0XHRcdH0sIFBPTExfSU5URVJWQUwpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX29wID0gdGhpcy5fb3BzLnNoaWZ0KCk7XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fb3AoZXJyID0+IHtcblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2RpZSkge1xuXHRcdFx0XHRcdHRoaXMuZW1pdCgnc3RvcHBlZCcpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNldEltbWVkaWF0ZSgoKSA9PiB0aGlzLl9sb29wKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xuXHRcdFx0XHQvLyBBc3N1bXB0aW9uOiBpdCBjcmFzaGVkIEJFRk9SRSBhbiBhc3luYyB3YWl0XG5cdFx0XHRcdC8vIG90aGVyd2lzZSwgd2UnbGwgZW5kIHVwIHdpdGggbW9yZSBzaW11bHRhbmVvdXNcblx0XHRcdFx0Ly8gYWN0aXZpdHlcblx0XHRcdHNldEltbWVkaWF0ZSgoKSA9PiB0aGlzLl9sb29wKCkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQb2xsIHRoZSBsb2dzIGRpcmVjdG9yeSBmb3IgbmV3L3VwZGF0ZWQgZmlsZXMuXG5cdCAqIEBwYXJhbSBjYWxsYmFjayB7ZnVuY3Rpb259XG5cdCAqL1xuXHRfcG9sbChjYWxsYmFjaykge1xuXHRcdGRlYnVnKCdfcG9sbCcpO1xuXG5cdFx0Y29uc3QgdW5zZWVuID0ge307XG5cdFx0T2JqZWN0LmtleXModGhpcy5fbG9nRGV0YWlsTWFwKS5mb3JFYWNoKGZpbGVuYW1lID0+IHtcblx0XHRcdGlmICghdGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXS50b21ic3RvbmVkKSB7XG5cdFx0XHRcdHVuc2VlbltmaWxlbmFtZV0gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0ZnMucmVhZGRpcih0aGlzLl9kaXJwYXRoLCAoZXJyLCBmaWxlbmFtZXMpID0+IHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0Y2FsbGJhY2soZXJyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVzID0gZmlsZW5hbWVzLnNsaWNlKGZpbGVuYW1lcy5sZW5ndGggLSB0aGlzLl9tYXhmaWxlcywgZmlsZW5hbWVzLmxlbmd0aCk7XG5cdFx0XHRcdGZpbGVzLmZvckVhY2goZmlsZW5hbWUgPT4ge1xuXHRcdFx0XHRcdGZpbGVuYW1lID0gcGF0aC5qb2luKHRoaXMuX2RpcnBhdGgsIGZpbGVuYW1lKTtcblx0XHRcdFx0XHRpZiAodGhpcy5fZmlsdGVyKGZpbGVuYW1lKSkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIHVuc2VlbltmaWxlbmFtZV07XG5cdFx0XHRcdFx0XHR0aGlzLl9vcHMucHVzaChjYiA9PiB0aGlzLl9zdGF0ZmlsZShmaWxlbmFtZSwgY2IpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdE9iamVjdC5rZXlzKHVuc2VlbikuZm9yRWFjaChmaWxlbmFtZSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5idXJ5KGZpbGVuYW1lKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y2FsbGJhY2sobnVsbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU3RhdCB0aGUgbmV3L3VwZGF0ZWQgZmlsZXMgaW4gbG9nIGRpcmVjdG9yeVxuXHQgKiBAcGFyYW0gZmlsZW5hbWUge3N0cmluZ30gUGF0aCB0byBmaWxlIHRvIGdldCBzdGF0cyBvZi5cblx0ICogQHBhcmFtIGNhbGxiYWNrXG5cdCAqL1xuXHRfc3RhdGZpbGUoZmlsZW5hbWUsIGNhbGxiYWNrKSB7XG5cdFx0ZGVidWcoJ19zdGF0ZmlsZScsIHtmaWxlbmFtZX0pO1xuXG5cdFx0ZnMuc3RhdChmaWxlbmFtZSwgKGVyciwgc3RhdHMpID0+IHtcblx0XHRcdGlmIChlcnIgJiYgZXJyLmNvZGUgPT09ICdFTk9FTlQnKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdKSB7XG5cdFx0XHRcdFx0dGhpcy5idXJ5KGZpbGVuYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYWxsYmFjayhudWxsKTsgLy8gRmlsZSBkZWxldGVkXG5cdFx0XHR9IGVsc2UgaWYgKGVycikge1xuXHRcdFx0XHRjYWxsYmFjayhlcnIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fb3BzLnB1c2goY2IgPT4gdGhpcy5fcHJvY2VzcyhmaWxlbmFtZSwgc3RhdHMsIGNiKSk7XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb2Nlc3MgdGhlIGZpbGVzXG5cdCAqIEBwYXJhbSBmaWxlbmFtZSB7c3RyaW5nfSBGaWxlbmFtZSB0byBjaGVja1xuXHQgKiBAcGFyYW0gc3RhdHMge29iamVjdH0gTGFzdCBtb2RpZmllZCBldGNcblx0ICogQHBhcmFtIGNhbGxiYWNrIHtmdW5jdGlvbn1cblx0ICovXG5cdF9wcm9jZXNzKGZpbGVuYW1lLCBzdGF0cywgY2FsbGJhY2spIHtcblx0XHRkZWJ1ZygnX3Byb2Nlc3MnLCB7ZmlsZW5hbWUsIHN0YXRzfSk7XG5cdFx0bGV0IENVUlJFTlRfRklMRSA9IDA7XG5cdFx0c2V0SW1tZWRpYXRlKGNhbGxiYWNrLCBudWxsKTtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXTtcblxuXHRcdGlmIChpbmZvID09PSB1bmRlZmluZWQgJiYgQ1VSUkVOVF9GSUxFIDwgdGhpcy5fbWF4ZmlsZXMpIHtcblx0XHRcdHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0gPSB7XG5cdFx0XHRcdGlubzogc3RhdHMuaW5vLFxuXHRcdFx0XHRtdGltZTogc3RhdHMubXRpbWUsXG5cdFx0XHRcdHNpemU6IHN0YXRzLnNpemUsXG5cdFx0XHRcdHdhdGVybWFyazogMCxcblx0XHRcdFx0dG9tYnN0b25lZDogZmFsc2Vcblx0XHRcdH07XG5cdFx0XHRDVVJSRU5UX0ZJTEUrKztcblx0XHRcdHRoaXMuX29wcy5wdXNoKGNiID0+IHRoaXMuX3JlYWQoZmlsZW5hbWUsIGNiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGluZm8udG9tYnN0b25lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpbmZvLmlubyAhPT0gc3RhdHMuaW5vKSB7XG5cdFx0XHRcdC8vIEZpbGUgcmVwbGFjZWQuLi4gY2FuJ3QgdHJ1c3QgaXQgYW55IG1vcmVcblx0XHRcdFx0Ly8gaWYgdGhlIGNsaWVudCBBUEkgc3VwcG9ydGVkIHJlcGxheSBmcm9tIHNjcmF0Y2gsIHdlIGNvdWxkIGRvIHRoYXRcblx0XHRcdFx0Ly8gYnV0IHdlIGNhbid0IHlldCwgc286XG5cdFx0XHRDVVJSRU5UX0ZJTEUgPSAwO1xuXHRcdFx0dGhpcy5idXJ5KGZpbGVuYW1lKTtcblx0XHR9IGVsc2UgaWYgKHN0YXRzLnNpemUgPiBpbmZvLnNpemUpIHtcblx0XHRcdFx0Ly8gRmlsZSBub3QgcmVwbGFjZWQ7IGdvdCBsb25nZXIuLi4gYXNzdW1lIGFwcGVuZFxuXHRcdFx0dGhpcy5fb3BzLnB1c2goY2IgPT4gdGhpcy5fcmVhZChmaWxlbmFtZSwgY2IpKTtcblx0XHR9IGVsc2UgaWYgKGluZm8uaW5vID09PSBzdGF0cy5pbm8gJiYgaW5mby5zaXplID09PSBzdGF0cy5zaXplKSB7XG5cdFx0XHRcdC8vIEV2ZW4gaWYgbXRpbWUgaXMgZGlmZmVyZW50LCB0cmVhdCBpdCBhcyB1bmNoYW5nZWRcblx0XHRcdFx0Ly8gZS5nLiBeWiB3aGVuIENPUFkgQ09OIHRvIGEgZmFrZSBsb2dcblx0XHRcdFx0Ly8gZG9uJ3QgcXVldWUgcmVhZFxuXHRcdH1cblxuXHRcdGluZm8ubXRpbWUgPSBzdGF0cy5tdGltZTtcblx0XHRpbmZvLnNpemUgPSBzdGF0cy5zaXplO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWQgdGhlIGZpbGVzXG5cdCAqIEBwYXJhbSBmaWxlbmFtZSB7c3RyaW5nfSBUaGUgZmlsZW5hbWUgdG8gcmVhZC5cblx0ICogQHBhcmFtIGNhbGxiYWNrIHtmdW5jdGlvbn1cblx0ICovXG5cdF9yZWFkKGZpbGVuYW1lLCBjYWxsYmFjaykge1xuXHRcdGNvbnN0IHt3YXRlcm1hcmssIHNpemV9ID0gdGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXTtcblx0XHRkZWJ1ZygnX3JlYWQnLCB7ZmlsZW5hbWUsIHdhdGVybWFyaywgc2l6ZX0pO1xuXHRcdGxldCBsZWZ0b3ZlciA9IEJ1ZmZlci5mcm9tKCcnLCAndXRmOCcpO1xuXG5cdFx0Y29uc3QgcyA9IGZzLmNyZWF0ZVJlYWRTdHJlYW0oZmlsZW5hbWUsIHtcblx0XHRcdGZsYWdzOiAncicsXG5cdFx0XHRzdGFydDogd2F0ZXJtYXJrLFxuXHRcdFx0ZW5kOiBzaXplXG5cdFx0fSk7XG5cdFx0Y29uc3QgZmluaXNoID0gZXJyID0+IHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHQvLyBPbiBhbnkgZXJyb3IsIGVtaXQgdGhlIGVycm9yIGFuZCBidXJ5IHRoZSBmaWxlLlxuXHRcdFx0XHR0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKTtcblx0XHRcdFx0dGhpcy5idXJ5KGZpbGVuYW1lKTtcblx0XHRcdH1cblx0XHRcdHNldEltbWVkaWF0ZShjYWxsYmFjaywgbnVsbCk7XG5cdFx0XHRjYWxsYmFjayA9ICgpID0+IHtcblx0XHRcdH07IC8vIE5vLW9wXG5cdFx0fTtcblx0XHRzLm9uY2UoJ2Vycm9yJywgZmluaXNoKTtcblxuXHRcdHMub25jZSgnZW5kJywgZmluaXNoKTtcblxuXHRcdHMub24oJ2RhdGEnLCBjaHVuayA9PiB7XG5cdFx0XHRjb25zdCBzVGhpcyA9IHRoaXM7XG5cdFx0XHRSYXZlbi5jb250ZXh0KGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0UmF2ZW4uY2FwdHVyZUJyZWFkY3J1bWIoe1xuXHRcdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRcdGNodW5rOiBjaHVuay50b1N0cmluZygpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgaWR4ID0gY2h1bmsubGFzdEluZGV4T2YoJ1xcbicpO1xuXHRcdFx0XHRpZiAoaWR4IDwgMCkge1xuXHRcdFx0XHRcdGxlZnRvdmVyID0gQnVmZmVyLmNvbmNhdChbbGVmdG92ZXIsIGNodW5rXSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c1RoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0ud2F0ZXJtYXJrICs9IGlkeCArIDE7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IG9icyA9IEJ1ZmZlci5jb25jYXQoW2xlZnRvdmVyLCBjaHVuay5zbGljZSgwLCBpZHggKyAxKV0pXG5cdFx0XHRcdFx0XHRcdC50b1N0cmluZygndXRmOCcpXG5cdFx0XHRcdFx0XHRcdC5yZXBsYWNlKC9cXHUwMDBlL2lnbSwgJycpXG5cdFx0XHRcdFx0XHRcdC5yZXBsYWNlKC9cXHUwMDBmL2lnbSwgJycpXG5cdFx0XHRcdFx0XHRcdC5zcGxpdCgvW1xcclxcbl0rLylcblx0XHRcdFx0XHRcdFx0LmZpbHRlcihsID0+IGwubGVuZ3RoID4gMClcblx0XHRcdFx0XHRcdFx0Lm1hcChsID0+IHtcblx0XHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIEpTT04ucGFyc2UobClcblx0XHRcdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRkZWJ1ZygnanNvbi5wYXJzZSBlcnJvcicsIHtsaW5lOiBsfSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRSYXZlbi5jb250ZXh0KGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0UmF2ZW4uY2FwdHVyZUJyZWFkY3J1bWIoe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2U6ICdGaWxlIHRoYXQgY3Jhc2hlZCBsb2cgd2F0Y2hlcicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZmlsZW5hbWVcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRSYXZlbi5jYXB0dXJlQnJlYWRjcnVtYih7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0bWVzc2FnZTogJ0xvZy13YXRjaGVyIEpTT04ucGFyc2UgZmFpbGVkJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRsaW5lOiBsLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y2h1bms6IGNodW5rLnRvU3RyaW5nKClcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRSYXZlbi5jYXB0dXJlRXhjZXB0aW9uKGUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0bGVmdG92ZXIgPSBjaHVuay5zbGljZShpZHggKyAxKTtcblx0XHRcdFx0XHRcdGlmIChvYnMpIHtcblx0XHRcdFx0XHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHNUaGlzLmVtaXQoJ2RhdGEnLCBvYnMpICYmIHNUaGlzLmVtaXQoJ2ZpbmlzaGVkJykpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHNUaGlzLmVtaXQoJ2RhdGEnLCB7fSkgJiYgc1RoaXMuZW1pdCgnZmluaXNoZWQnKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHRmaW5pc2goZXJyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cdH1cbi8qKlxuICogR2V0IHRoZSBwYXRoIG9mIHRoZSBsb2dzLlxuICogQHBhcmFtIGZwYXRoIHtzdHJpbmd9IFBhdGggdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgZGlyZWN0b3J5IGNvbnRhaW5zIGpvdXJuYWwgZmlsZXMuXG4gKi9cbmZ1bmN0aW9uIGlzQ29tbWFuZGVyTG9nKGZwYXRoKSB7XG5cdGNvbnN0IGJhc2UgPSBwYXRoLmJhc2VuYW1lKGZwYXRoKTtcblx0cmV0dXJuIGJhc2UuaW5kZXhPZignSm91cm5hbC4nKSA9PT0gMCAmJiBwYXRoLmV4dG5hbWUoZnBhdGgpID09PSAnLmxvZyc7XG59XG5cbmlmICghbW9kdWxlLnBhcmVudCkge1xuXHRwcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIGVyciA9PiB7XG5cdFx0Y29uc29sZS5lcnJvcihlcnIuc3RhY2sgfHwgZXJyKTtcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XG5cdH0pO1xuXG5cdGNvbnN0IHdhdGNoZXIgPSBuZXcgTG9nV2F0Y2hlcihERUZBVUxUX1NBVkVfRElSLCAzKTtcblx0d2F0Y2hlci5vbignZXJyb3InLCBlcnIgPT4ge1xuXHRcdHdhdGNoZXIuc3RvcCgpO1xuXHRcdGNvbnNvbGUuZXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGVyci5zdGFjayB8fCBlcnIpO1xuXHR9KTtcblx0d2F0Y2hlci5vbignZGF0YScsIG9icyA9PiB7XG5cdFx0Ly8gb2JzLmZvckVhY2gob2IgPT4ge1xuXHRcdC8vIFx0Y29uc3Qge3RpbWVzdGFtcCwgZXZlbnR9ID0gb2I7XG5cdFx0Ly8gXHRjb25zb2xlLmxvZygnXFxuJyArIHRpbWVzdGFtcCwgZXZlbnQpO1xuXHRcdC8vIFx0ZGVsZXRlIG9iLnRpbWVzdGFtcDtcblx0XHQvLyBcdGRlbGV0ZSBvYi5ldmVudDtcblx0XHQvLyBcdE9iamVjdC5rZXlzKG9iKS5zb3J0KCkuZm9yRWFjaChrID0+IHtcblx0XHQvLyBcdFx0Ly8gY29uc29sZS5sb2coJ1xcdCcgKyBrLCBvYltrXSk7XG5cdFx0Ly8gXHR9KTtcblx0XHQvLyB9KTtcblx0fSk7XG59XG4iXX0=
