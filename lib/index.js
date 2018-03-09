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

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var debug = (0, _debug2.default)('ed-logwatcher');

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
  * @param ignoreInitial {boolean} Ignore initial read or not.
  */
	function LogWatcher(dirpath, maxfiles, ignoreInitial) {
		_classCallCheck(this, LogWatcher);

		var _this = _possibleConstructorReturn(this, (LogWatcher.__proto__ || Object.getPrototypeOf(LogWatcher)).call(this));

		_this._dirpath = dirpath || DEFAULT_SAVE_DIR;
		_this._filter = isCommanderLog;
		_this._maxfiles = maxfiles || 3;
		_this._logDetailMap = {};
		_this._ops = [];
		_this._op = null;
		_this._startTime = new Date();
		_this._timer = null;
		_this._die = false;
		_this._ignoreInitial = ignoreInitial || false;
		_this.stopped = false;
		_this._loop();
		_this.emit('Started');
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
				this.stopped = true;
				this.emit('stopped');
			} else {
				this._ops.splice(this._ops.length);
				this.stopped = true;
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

			_fs2.default.readdir(this._dirpath, function (err, filenames) {
				if (err) {
					callback(err);
				} else {
					var counter = _this3._maxfiles;

					var _loop2 = function _loop2(i) {
						var filename = _path2.default.join(_this3._dirpath, filenames[i]);
						if (_this3._filter(filename)) {
							counter--;
							delete unseen[filename];
							_this3._ops.push(function (cb) {
								return _this3._statfile(filename, cb);
							});
						}
					};

					for (var i = filenames.length - 1; i >= 0 && counter; i--) {
						_loop2(i);
					}

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

			_fs2.default.stat(filename, function (err, stats) {
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

			debug('_process', { filename: filename });
			var CURRENT_FILE = 0;
			setImmediate(callback, null);
			var info = this._logDetailMap[filename];
			if (this._ignoreInitial && stats.mtime < this._startTime) {
				return;
			}
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

			var s = _fs2.default.createReadStream(filename, {
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
				var idx = chunk.lastIndexOf('\n');
				if (idx < 0) {
					leftover = Buffer.concat([leftover, chunk]);
				} else {
					_this6._logDetailMap[filename].watermark += idx + 1;
					try {
						var obs = Buffer.concat([leftover, chunk.slice(0, idx + 1)]).toString('utf8').replace(/\u000e/igm, '').replace(/\u000f/igm, '').split(/[\r\n]+/).filter(function (l) {
							return l.length > 0;
						}).map(function (l) {
							try {
								return JSON.parse(l);
							} catch (e) {
								debug('json.parse error', { line: l });
							}
						});
						leftover = chunk.slice(idx + 1);
						if (obs) {
							debug('data emit');
							setImmediate(function () {
								return _this6.emit('data', obs) && _this6.emit('finished');
							});
						} else {
							debug('data emit');
							setImmediate(function () {
								return _this6.emit('data', {}) && _this6.emit('finished');
							});
						}
					} catch (err) {
						finish(err);
					}
				}
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

	var watcher = new LogWatcher(DEFAULT_SAVE_DIR, 3, true);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2ctd2F0Y2hlci5qcyJdLCJuYW1lcyI6WyJkZWJ1ZyIsIlBPTExfSU5URVJWQUwiLCJERUZBVUxUX1NBVkVfRElSIiwiam9pbiIsImhvbWVkaXIiLCJMb2dXYXRjaGVyIiwiZGlycGF0aCIsIm1heGZpbGVzIiwiaWdub3JlSW5pdGlhbCIsIl9kaXJwYXRoIiwiX2ZpbHRlciIsImlzQ29tbWFuZGVyTG9nIiwiX21heGZpbGVzIiwiX2xvZ0RldGFpbE1hcCIsIl9vcHMiLCJfb3AiLCJfc3RhcnRUaW1lIiwiRGF0ZSIsIl90aW1lciIsIl9kaWUiLCJfaWdub3JlSW5pdGlhbCIsInN0b3BwZWQiLCJfbG9vcCIsImVtaXQiLCJmaWxlbmFtZSIsInRvbWJzdG9uZWQiLCJjbGVhclRpbWVvdXQiLCJzcGxpY2UiLCJsZW5ndGgiLCJvcGNvdW50Iiwic2V0VGltZW91dCIsInB1c2giLCJfcG9sbCIsImNhbGxiYWNrIiwic2V0SW1tZWRpYXRlIiwic2hpZnQiLCJlcnIiLCJ1bnNlZW4iLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsInJlYWRkaXIiLCJmaWxlbmFtZXMiLCJjb3VudGVyIiwiaSIsIl9zdGF0ZmlsZSIsImNiIiwiYnVyeSIsInN0YXQiLCJzdGF0cyIsImNvZGUiLCJfcHJvY2VzcyIsIkNVUlJFTlRfRklMRSIsImluZm8iLCJtdGltZSIsInVuZGVmaW5lZCIsImlubyIsInNpemUiLCJ3YXRlcm1hcmsiLCJfcmVhZCIsImxlZnRvdmVyIiwiQnVmZmVyIiwiZnJvbSIsInMiLCJjcmVhdGVSZWFkU3RyZWFtIiwiZmxhZ3MiLCJzdGFydCIsImVuZCIsImZpbmlzaCIsIm9uY2UiLCJvbiIsImlkeCIsImNodW5rIiwibGFzdEluZGV4T2YiLCJjb25jYXQiLCJvYnMiLCJzbGljZSIsInRvU3RyaW5nIiwicmVwbGFjZSIsInNwbGl0IiwiZmlsdGVyIiwibCIsIm1hcCIsIkpTT04iLCJwYXJzZSIsImUiLCJsaW5lIiwiRXZlbnRFbWl0dGVyIiwiZnBhdGgiLCJiYXNlIiwiYmFzZW5hbWUiLCJpbmRleE9mIiwiZXh0bmFtZSIsIm1vZHVsZSIsInBhcmVudCIsInByb2Nlc3MiLCJjb25zb2xlIiwiZXJyb3IiLCJzdGFjayIsIkVycm9yIiwid2F0Y2hlciIsInN0b3AiLCJ0aW1lc3RhbXAiLCJvYiIsImV2ZW50IiwibG9nIiwic29ydCJdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7O0FBS0E7OztBQUdBOzs7Ozs7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7Ozs7Ozs7Ozs7QUFFQSxJQUFNQSxRQUFRLHFCQUFPLGVBQVAsQ0FBZDs7QUFHQTs7OztBQUlBLElBQU1DLGdCQUFnQixJQUF0QjtBQUNBOzs7O0FBSUEsSUFBTUMsbUJBQW1CLGVBQUtDLElBQUwsQ0FDeEIsYUFBR0MsT0FBSCxFQUR3QixFQUV4QixhQUZ3QixFQUd4Qix1QkFId0IsRUFJeEIsaUJBSndCLENBQXpCO0FBTUE7Ozs7O0lBSWFDLFUsV0FBQUEsVTs7O0FBQ1o7Ozs7OztBQU1BLHFCQUFZQyxPQUFaLEVBQXFCQyxRQUFyQixFQUErQkMsYUFBL0IsRUFBOEM7QUFBQTs7QUFBQTs7QUFHN0MsUUFBS0MsUUFBTCxHQUFnQkgsV0FBV0osZ0JBQTNCO0FBQ0EsUUFBS1EsT0FBTCxHQUFlQyxjQUFmO0FBQ0EsUUFBS0MsU0FBTCxHQUFpQkwsWUFBWSxDQUE3QjtBQUNBLFFBQUtNLGFBQUwsR0FBcUIsRUFBckI7QUFDQSxRQUFLQyxJQUFMLEdBQVksRUFBWjtBQUNBLFFBQUtDLEdBQUwsR0FBVyxJQUFYO0FBQ0EsUUFBS0MsVUFBTCxHQUFrQixJQUFJQyxJQUFKLEVBQWxCO0FBQ0EsUUFBS0MsTUFBTCxHQUFjLElBQWQ7QUFDQSxRQUFLQyxJQUFMLEdBQVksS0FBWjtBQUNBLFFBQUtDLGNBQUwsR0FBc0JaLGlCQUFpQixLQUF2QztBQUNBLFFBQUthLE9BQUwsR0FBZSxLQUFmO0FBQ0EsUUFBS0MsS0FBTDtBQUNBLFFBQUtDLElBQUwsQ0FBVSxTQUFWO0FBZjZDO0FBZ0I3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RDs7QUFFakJSLFdBQVFTLEdBQVIsQ0FBWSxPQUFPSCxTQUFuQixFQUE4QkUsS0FBOUI7QUFDQSxVQUFPRCxHQUFHRCxTQUFWO0FBQ0EsVUFBT0MsR0FBR0MsS0FBVjtBQUNBbEUsVUFBT0MsSUFBUCxDQUFZZ0UsRUFBWixFQUFnQkcsSUFBaEIsR0FBdUJsRSxPQUF2QixDQUErQixhQUFLO0FBQ25DO0FBQ0EsSUFGRDtBQUdBLEdBUkQ7QUFTQSxFQVZEO0FBV0EiLCJmaWxlIjoibG9nLXdhdGNoZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBmaWxlIFRoZSBmaWxlIHRoYXQgZG9lcyB0aGUgd2F0Y2hlciBwcm9jZXNzaW5nLlxuICogQGF1dGhvciB3aWxseWIzMjFcbiAqIEBjb3B5cmlnaHQgTUlUXG4gKi9cbi8qKlxuICogQG1vZHVsZSBXYXRjaGVyXG4gKi9cbid1c2Ugc3RyaWN0JztcbmltcG9ydCBldmVudHMgZnJvbSAnZXZlbnRzJztcbmltcG9ydCBvcyBmcm9tICdvcyc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCBmcyBmcm9tICdmcyc7XG5pbXBvcnQgZGVidWcwIGZyb20gJ2RlYnVnJztcblxuY29uc3QgZGVidWcgPSBkZWJ1ZzAoJ2VkLWxvZ3dhdGNoZXInKTtcblxuXG4vKipcbiAqIEludGVydmFsIGluIE1TIHRvIHBvbGwgZGlyZWN0b3J5IGF0LlxuICogQHR5cGUge251bWJlcn1cbiAqL1xuY29uc3QgUE9MTF9JTlRFUlZBTCA9IDEwMDA7XG4vKipcbiAqIERlZmF1bHQgcGF0aCB0byBqb3VybmFsIGZpbGVzIGZvciBFbGl0ZS5cbiAqIEB0eXBlIHtzdHJpbmd9XG4gKi9cbmNvbnN0IERFRkFVTFRfU0FWRV9ESVIgPSBwYXRoLmpvaW4oXG5cdG9zLmhvbWVkaXIoKSxcblx0J1NhdmVkIEdhbWVzJyxcblx0J0Zyb250aWVyIERldmVsb3BtZW50cycsXG5cdCdFbGl0ZSBEYW5nZXJvdXMnXG4pO1xuLyoqXG4gKiBAY2xhc3MgVGhlIG1haW4gY2xhc3MuXG4gKiBAdHV0b3JpYWwgTG9nV2F0Y2hlci1UdXRvcmlhbFxuICovXG5leHBvcnQgY2xhc3MgTG9nV2F0Y2hlciBleHRlbmRzIGV2ZW50cy5FdmVudEVtaXR0ZXIge1xuXHQvKipcblx0ICogQ29uc3RydWN0IHRoZSBsb2cgd2F0Y2hlci5cblx0ICogQHBhcmFtIGRpcnBhdGgge3N0cmluZ30gVGhlIGRpcmVjdG9yeSB0byB3YXRjaC5cblx0ICogQHBhcmFtIG1heGZpbGVzIHtudW1iZXJ9IE1heGltdW0gYW1vdW50IG9mIGZpbGVzIHRvIHByb2Nlc3MuXG5cdCAqIEBwYXJhbSBpZ25vcmVJbml0aWFsIHtib29sZWFufSBJZ25vcmUgaW5pdGlhbCByZWFkIG9yIG5vdC5cblx0ICovXG5cdGNvbnN0cnVjdG9yKGRpcnBhdGgsIG1heGZpbGVzLCBpZ25vcmVJbml0aWFsKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2RpcnBhdGggPSBkaXJwYXRoIHx8IERFRkFVTFRfU0FWRV9ESVI7XG5cdFx0dGhpcy5fZmlsdGVyID0gaXNDb21tYW5kZXJMb2c7XG5cdFx0dGhpcy5fbWF4ZmlsZXMgPSBtYXhmaWxlcyB8fCAzO1xuXHRcdHRoaXMuX2xvZ0RldGFpbE1hcCA9IHt9O1xuXHRcdHRoaXMuX29wcyA9IFtdO1xuXHRcdHRoaXMuX29wID0gbnVsbDtcblx0XHR0aGlzLl9zdGFydFRpbWUgPSBuZXcgRGF0ZSgpO1xuXHRcdHRoaXMuX3RpbWVyID0gbnVsbDtcblx0XHR0aGlzLl9kaWUgPSBmYWxzZTtcblx0XHR0aGlzLl9pZ25vcmVJbml0aWFsID0gaWdub3JlSW5pdGlhbCB8fCBmYWxzZTtcblx0XHR0aGlzLnN0b3BwZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9sb29wKCk7XG5cdFx0dGhpcy5lbWl0KCdTdGFydGVkJyk7XG5cdH1cblxuXHQvKipcblx0ICogQnVyeSBhIGZpbGVcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IEZpbGUgdG8gYnVyeS5cblx0ICovXG5cdGJ1cnkoZmlsZW5hbWUpIHtcblx0XHRkZWJ1ZygnYnVyeScsIHtmaWxlbmFtZX0pO1xuXHRcdHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0udG9tYnN0b25lZCA9IHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogU3RvcCBydW5uaW5nXG5cdCAqL1xuXHRzdG9wKCkge1xuXHRcdGRlYnVnKCdzdG9wJyk7XG5cblx0XHRpZiAodGhpcy5fb3AgPT09IG51bGwpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl90aW1lcik7XG5cdFx0XHR0aGlzLnN0b3BwZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5lbWl0KCdzdG9wcGVkJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX29wcy5zcGxpY2UodGhpcy5fb3BzLmxlbmd0aCk7XG5cdFx0XHR0aGlzLnN0b3BwZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fZGllID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVGhlIG1haW4gbG9vcFxuXHQgKi9cblx0X2xvb3AoKSB7XG5cdFx0ZGVidWcoJ19sb29wJywge29wY291bnQ6IHRoaXMuX29wcy5sZW5ndGh9KTtcblxuXHRcdHRoaXMuX29wID0gbnVsbDtcblxuXHRcdGlmICh0aGlzLl9vcHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl90aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vcHMucHVzaChjYWxsYmFjayA9PiB0aGlzLl9wb2xsKGNhbGxiYWNrKSk7XG5cdFx0XHRcdHNldEltbWVkaWF0ZSgoKSA9PiB0aGlzLl9sb29wKCkpO1xuXHRcdFx0fSwgUE9MTF9JTlRFUlZBTCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fb3AgPSB0aGlzLl9vcHMuc2hpZnQoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9vcChlcnIgPT4ge1xuXHRcdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5lbWl0KCdlcnJvcicsIGVycik7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fZGllKSB7XG5cdFx0XHRcdFx0dGhpcy5lbWl0KCdzdG9wcGVkJyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuX2xvb3AoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5lbWl0KCdlcnJvcicsIGVycik7XG5cdFx0XHRcdC8vIEFzc3VtcHRpb246IGl0IGNyYXNoZWQgQkVGT1JFIGFuIGFzeW5jIHdhaXRcblx0XHRcdFx0Ly8gb3RoZXJ3aXNlLCB3ZSdsbCBlbmQgdXAgd2l0aCBtb3JlIHNpbXVsdGFuZW91c1xuXHRcdFx0XHQvLyBhY3Rpdml0eVxuXHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuX2xvb3AoKSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFBvbGwgdGhlIGxvZ3MgZGlyZWN0b3J5IGZvciBuZXcvdXBkYXRlZCBmaWxlcy5cblx0ICogQHBhcmFtIGNhbGxiYWNrIHtmdW5jdGlvbn1cblx0ICovXG5cdF9wb2xsKGNhbGxiYWNrKSB7XG5cdFx0ZGVidWcoJ19wb2xsJyk7XG5cblx0XHRjb25zdCB1bnNlZW4gPSB7fTtcblx0XHRPYmplY3Qua2V5cyh0aGlzLl9sb2dEZXRhaWxNYXApLmZvckVhY2goZmlsZW5hbWUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdLnRvbWJzdG9uZWQpIHtcblx0XHRcdFx0dW5zZWVuW2ZpbGVuYW1lXSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRmcy5yZWFkZGlyKHRoaXMuX2RpcnBhdGgsIChlcnIsIGZpbGVuYW1lcykgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRjYWxsYmFjayhlcnIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IGNvdW50ZXIgPSB0aGlzLl9tYXhmaWxlcztcblx0XHRcdFx0Zm9yIChsZXQgaSA9IGZpbGVuYW1lcy5sZW5ndGggLSAxOyBpID49IDAgJiYgY291bnRlcjsgaS0tKSB7XG5cdFx0XHRcdFx0bGV0IGZpbGVuYW1lID0gcGF0aC5qb2luKHRoaXMuX2RpcnBhdGgsIGZpbGVuYW1lc1tpXSk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2ZpbHRlcihmaWxlbmFtZSkpIHtcblx0XHRcdFx0XHRcdGNvdW50ZXItLTtcblx0XHRcdFx0XHRcdGRlbGV0ZSB1bnNlZW5bZmlsZW5hbWVdO1xuXHRcdFx0XHRcdFx0dGhpcy5fb3BzLnB1c2goY2IgPT4gdGhpcy5fc3RhdGZpbGUoZmlsZW5hbWUsIGNiKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0T2JqZWN0LmtleXModW5zZWVuKS5mb3JFYWNoKGZpbGVuYW1lID0+IHtcblx0XHRcdFx0XHR0aGlzLmJ1cnkoZmlsZW5hbWUpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjYWxsYmFjayhudWxsKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdGF0IHRoZSBuZXcvdXBkYXRlZCBmaWxlcyBpbiBsb2cgZGlyZWN0b3J5XG5cdCAqIEBwYXJhbSBmaWxlbmFtZSB7c3RyaW5nfSBQYXRoIHRvIGZpbGUgdG8gZ2V0IHN0YXRzIG9mLlxuXHQgKiBAcGFyYW0gY2FsbGJhY2tcblx0ICovXG5cdF9zdGF0ZmlsZShmaWxlbmFtZSwgY2FsbGJhY2spIHtcblx0XHRkZWJ1ZygnX3N0YXRmaWxlJywge2ZpbGVuYW1lfSk7XG5cblx0XHRmcy5zdGF0KGZpbGVuYW1lLCAoZXJyLCBzdGF0cykgPT4ge1xuXHRcdFx0aWYgKGVyciAmJiBlcnIuY29kZSA9PT0gJ0VOT0VOVCcpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0pIHtcblx0XHRcdFx0XHR0aGlzLmJ1cnkoZmlsZW5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwpOyAvLyBGaWxlIGRlbGV0ZWRcblx0XHRcdH0gZWxzZSBpZiAoZXJyKSB7XG5cdFx0XHRcdGNhbGxiYWNrKGVycik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9vcHMucHVzaChjYiA9PiB0aGlzLl9wcm9jZXNzKGZpbGVuYW1lLCBzdGF0cywgY2IpKTtcblx0XHRcdFx0Y2FsbGJhY2sobnVsbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUHJvY2VzcyB0aGUgZmlsZXNcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IEZpbGVuYW1lIHRvIGNoZWNrXG5cdCAqIEBwYXJhbSBzdGF0cyB7b2JqZWN0fSBMYXN0IG1vZGlmaWVkIGV0Y1xuXHQgKiBAcGFyYW0gY2FsbGJhY2sge2Z1bmN0aW9ufVxuXHQgKi9cblx0X3Byb2Nlc3MoZmlsZW5hbWUsIHN0YXRzLCBjYWxsYmFjaykge1xuXHRcdGRlYnVnKCdfcHJvY2VzcycsIHtmaWxlbmFtZX0pO1xuXHRcdGxldCBDVVJSRU5UX0ZJTEUgPSAwO1xuXHRcdHNldEltbWVkaWF0ZShjYWxsYmFjaywgbnVsbCk7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV07XG5cdFx0aWYgKHRoaXMuX2lnbm9yZUluaXRpYWwgJiYgc3RhdHMubXRpbWUgPCB0aGlzLl9zdGFydFRpbWUpIHtcblx0XHRcdHJldHVyblxuXHRcdH1cblx0XHRpZiAoaW5mbyA9PT0gdW5kZWZpbmVkICYmIENVUlJFTlRfRklMRSA8IHRoaXMuX21heGZpbGVzKSB7XG5cdFx0XHR0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdID0ge1xuXHRcdFx0XHRpbm86IHN0YXRzLmlubyxcblx0XHRcdFx0bXRpbWU6IHN0YXRzLm10aW1lLFxuXHRcdFx0XHRzaXplOiBzdGF0cy5zaXplLFxuXHRcdFx0XHR3YXRlcm1hcms6IDAsXG5cdFx0XHRcdHRvbWJzdG9uZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0Q1VSUkVOVF9GSUxFKys7XG5cdFx0XHR0aGlzLl9vcHMucHVzaChjYiA9PiB0aGlzLl9yZWFkKGZpbGVuYW1lLCBjYikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpbmZvLnRvbWJzdG9uZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaW5mby5pbm8gIT09IHN0YXRzLmlubykge1xuXHRcdFx0XHQvLyBGaWxlIHJlcGxhY2VkLi4uIGNhbid0IHRydXN0IGl0IGFueSBtb3JlXG5cdFx0XHRcdC8vIGlmIHRoZSBjbGllbnQgQVBJIHN1cHBvcnRlZCByZXBsYXkgZnJvbSBzY3JhdGNoLCB3ZSBjb3VsZCBkbyB0aGF0XG5cdFx0XHRcdC8vIGJ1dCB3ZSBjYW4ndCB5ZXQsIHNvOlxuXHRcdFx0Q1VSUkVOVF9GSUxFID0gMDtcblx0XHRcdHRoaXMuYnVyeShmaWxlbmFtZSk7XG5cdFx0fSBlbHNlIGlmIChzdGF0cy5zaXplID4gaW5mby5zaXplKSB7XG5cdFx0XHRcdC8vIEZpbGUgbm90IHJlcGxhY2VkOyBnb3QgbG9uZ2VyLi4uIGFzc3VtZSBhcHBlbmRcblx0XHRcdHRoaXMuX29wcy5wdXNoKGNiID0+IHRoaXMuX3JlYWQoZmlsZW5hbWUsIGNiKSk7XG5cdFx0fSBlbHNlIGlmIChpbmZvLmlubyA9PT0gc3RhdHMuaW5vICYmIGluZm8uc2l6ZSA9PT0gc3RhdHMuc2l6ZSkge1xuXHRcdFx0XHQvLyBFdmVuIGlmIG10aW1lIGlzIGRpZmZlcmVudCwgdHJlYXQgaXQgYXMgdW5jaGFuZ2VkXG5cdFx0XHRcdC8vIGUuZy4gXlogd2hlbiBDT1BZIENPTiB0byBhIGZha2UgbG9nXG5cdFx0XHRcdC8vIGRvbid0IHF1ZXVlIHJlYWRcblx0XHR9XG5cblx0XHRpbmZvLm10aW1lID0gc3RhdHMubXRpbWU7XG5cdFx0aW5mby5zaXplID0gc3RhdHMuc2l6ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkIHRoZSBmaWxlc1xuXHQgKiBAcGFyYW0gZmlsZW5hbWUge3N0cmluZ30gVGhlIGZpbGVuYW1lIHRvIHJlYWQuXG5cdCAqIEBwYXJhbSBjYWxsYmFjayB7ZnVuY3Rpb259XG5cdCAqL1xuXHRfcmVhZChmaWxlbmFtZSwgY2FsbGJhY2spIHtcblx0XHRjb25zdCB7d2F0ZXJtYXJrLCBzaXplfSA9IHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV07XG5cdFx0ZGVidWcoJ19yZWFkJywge2ZpbGVuYW1lLCB3YXRlcm1hcmssIHNpemV9KTtcblx0XHRsZXQgbGVmdG92ZXIgPSBCdWZmZXIuZnJvbSgnJywgJ3V0ZjgnKTtcblxuXHRcdGNvbnN0IHMgPSBmcy5jcmVhdGVSZWFkU3RyZWFtKGZpbGVuYW1lLCB7XG5cdFx0XHRmbGFnczogJ3InLFxuXHRcdFx0c3RhcnQ6IHdhdGVybWFyayxcblx0XHRcdGVuZDogc2l6ZVxuXHRcdH0pO1xuXHRcdGNvbnN0IGZpbmlzaCA9IGVyciA9PiB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0Ly8gT24gYW55IGVycm9yLCBlbWl0IHRoZSBlcnJvciBhbmQgYnVyeSB0aGUgZmlsZS5cblx0XHRcdFx0dGhpcy5lbWl0KCdlcnJvcicsIGVycik7XG5cdFx0XHRcdHRoaXMuYnVyeShmaWxlbmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRzZXRJbW1lZGlhdGUoY2FsbGJhY2ssIG51bGwpO1xuXHRcdFx0Y2FsbGJhY2sgPSAoKSA9PiB7XG5cdFx0XHR9OyAvLyBOby1vcFxuXHRcdH07XG5cdFx0cy5vbmNlKCdlcnJvcicsIGZpbmlzaCk7XG5cblx0XHRzLm9uY2UoJ2VuZCcsIGZpbmlzaCk7XG5cblx0XHRzLm9uKCdkYXRhJywgY2h1bmsgPT4ge1xuXHRcdFx0XHRjb25zdCBpZHggPSBjaHVuay5sYXN0SW5kZXhPZignXFxuJyk7XG5cdFx0XHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRcdFx0bGVmdG92ZXIgPSBCdWZmZXIuY29uY2F0KFtsZWZ0b3ZlciwgY2h1bmtdKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdLndhdGVybWFyayArPSBpZHggKyAxO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvYnMgPSBCdWZmZXIuY29uY2F0KFtsZWZ0b3ZlciwgY2h1bmsuc2xpY2UoMCwgaWR4ICsgMSldKVxuXHRcdFx0XHRcdFx0XHQudG9TdHJpbmcoJ3V0ZjgnKVxuXHRcdFx0XHRcdFx0XHQucmVwbGFjZSgvXFx1MDAwZS9pZ20sICcnKVxuXHRcdFx0XHRcdFx0XHQucmVwbGFjZSgvXFx1MDAwZi9pZ20sICcnKVxuXHRcdFx0XHRcdFx0XHQuc3BsaXQoL1tcXHJcXG5dKy8pXG5cdFx0XHRcdFx0XHRcdC5maWx0ZXIobCA9PiBsLmxlbmd0aCA+IDApXG5cdFx0XHRcdFx0XHRcdC5tYXAobCA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKGwpXG5cdFx0XHRcdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZGVidWcoJ2pzb24ucGFyc2UgZXJyb3InLCB7bGluZTogbH0pO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRsZWZ0b3ZlciA9IGNodW5rLnNsaWNlKGlkeCArIDEpO1xuXHRcdFx0XHRcdFx0aWYgKG9icykge1xuXHRcdFx0XHRcdFx0XHRkZWJ1ZygnZGF0YSBlbWl0Jyk7XG5cdFx0XHRcdFx0XHRcdHNldEltbWVkaWF0ZSgoKSA9PiB0aGlzLmVtaXQoJ2RhdGEnLCBvYnMpICYmIHRoaXMuZW1pdCgnZmluaXNoZWQnKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnKCdkYXRhIGVtaXQnKTtcblx0XHRcdFx0XHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuZW1pdCgnZGF0YScsIHt9KSAmJiB0aGlzLmVtaXQoJ2ZpbmlzaGVkJykpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0ZmluaXNoKGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxufVxuLyoqXG4gKiBHZXQgdGhlIHBhdGggb2YgdGhlIGxvZ3MuXG4gKiBAcGFyYW0gZnBhdGgge3N0cmluZ30gUGF0aCB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSBkaXJlY3RvcnkgY29udGFpbnMgam91cm5hbCBmaWxlcy5cbiAqL1xuZnVuY3Rpb24gaXNDb21tYW5kZXJMb2coZnBhdGgpIHtcblx0Y29uc3QgYmFzZSA9IHBhdGguYmFzZW5hbWUoZnBhdGgpO1xuXHRyZXR1cm4gYmFzZS5pbmRleE9mKCdKb3VybmFsLicpID09PSAwICYmIHBhdGguZXh0bmFtZShmcGF0aCkgPT09ICcubG9nJztcbn1cblxuaWYgKCFtb2R1bGUucGFyZW50KSB7XG5cdHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgZXJyID0+IHtcblx0XHRjb25zb2xlLmVycm9yKGVyci5zdGFjayB8fCBlcnIpO1xuXHRcdHRocm93IG5ldyBFcnJvcihlcnIuc3RhY2sgfHwgZXJyKTtcblx0fSk7XG5cblx0Y29uc3Qgd2F0Y2hlciA9IG5ldyBMb2dXYXRjaGVyKERFRkFVTFRfU0FWRV9ESVIsIDMsIHRydWUpO1xuXHR3YXRjaGVyLm9uKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0d2F0Y2hlci5zdG9wKCk7XG5cdFx0Y29uc29sZS5lcnJvcihlcnIuc3RhY2sgfHwgZXJyKTtcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XG5cdH0pO1xuXHR3YXRjaGVyLm9uKCdkYXRhJywgb2JzID0+IHtcblx0XHRvYnMuZm9yRWFjaChvYiA9PiB7XG5cdFx0XHRjb25zdCB7dGltZXN0YW1wLCBldmVudH0gPSBvYjtcblx0XHRcdGNvbnNvbGUubG9nKCdcXG4nICsgdGltZXN0YW1wLCBldmVudCk7XG5cdFx0XHRkZWxldGUgb2IudGltZXN0YW1wO1xuXHRcdFx0ZGVsZXRlIG9iLmV2ZW50O1xuXHRcdFx0T2JqZWN0LmtleXMob2IpLnNvcnQoKS5mb3JFYWNoKGsgPT4ge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnXFx0JyArIGssIG9iW2tdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn1cbiJdfQ==
