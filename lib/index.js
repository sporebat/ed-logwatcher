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

var _raven = require('raven');

var _raven2 = _interopRequireDefault(_raven);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var debug = (0, _debug2.default)('ed-logwatcher');

_raven2.default.config('https://4032cf9202554211a705659a67b145cd:68ec3ebeac8d488298db8e224a9d4a2d@sentry.io/229768', {
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

			_fs2.default.readdir(this._dirpath, function (err, filenames) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2ctd2F0Y2hlci5qcyJdLCJuYW1lcyI6WyJkZWJ1ZyIsImNvbmZpZyIsInJlbGVhc2UiLCJyZXF1aXJlIiwidmVyc2lvbiIsImF1dG9CcmVhZGNydW1icyIsImluc3RhbGwiLCJQT0xMX0lOVEVSVkFMIiwiREVGQVVMVF9TQVZFX0RJUiIsImpvaW4iLCJob21lZGlyIiwiTG9nV2F0Y2hlciIsImRpcnBhdGgiLCJtYXhmaWxlcyIsIl9kaXJwYXRoIiwiX2ZpbHRlciIsImlzQ29tbWFuZGVyTG9nIiwiX21heGZpbGVzIiwiX2xvZ0RldGFpbE1hcCIsIl9vcHMiLCJfb3AiLCJfdGltZXIiLCJfZGllIiwiX2xvb3AiLCJmaWxlbmFtZSIsInRvbWJzdG9uZWQiLCJjbGVhclRpbWVvdXQiLCJlbWl0Iiwic3BsaWNlIiwibGVuZ3RoIiwib3Bjb3VudCIsInNldFRpbWVvdXQiLCJwdXNoIiwiX3BvbGwiLCJjYWxsYmFjayIsInNldEltbWVkaWF0ZSIsInNoaWZ0IiwiZXJyIiwidW5zZWVuIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJyZWFkZGlyIiwiZmlsZW5hbWVzIiwiZmlsZXMiLCJzbGljZSIsIl9zdGF0ZmlsZSIsImNiIiwiYnVyeSIsInN0YXQiLCJzdGF0cyIsImNvZGUiLCJfcHJvY2VzcyIsIkNVUlJFTlRfRklMRSIsImluZm8iLCJ1bmRlZmluZWQiLCJpbm8iLCJtdGltZSIsInNpemUiLCJ3YXRlcm1hcmsiLCJfcmVhZCIsImxlZnRvdmVyIiwiQnVmZmVyIiwiZnJvbSIsInMiLCJjcmVhdGVSZWFkU3RyZWFtIiwiZmxhZ3MiLCJzdGFydCIsImVuZCIsImZpbmlzaCIsIm9uY2UiLCJvbiIsInNUaGlzIiwiY29udGV4dCIsImNhcHR1cmVCcmVhZGNydW1iIiwiZGF0YSIsImNodW5rIiwidG9TdHJpbmciLCJpZHgiLCJsYXN0SW5kZXhPZiIsImNvbmNhdCIsIm9icyIsInJlcGxhY2UiLCJzcGxpdCIsImZpbHRlciIsImwiLCJtYXAiLCJKU09OIiwicGFyc2UiLCJlIiwibGluZSIsIm1lc3NhZ2UiLCJjYXB0dXJlRXhjZXB0aW9uIiwiRXZlbnRFbWl0dGVyIiwiZnBhdGgiLCJiYXNlIiwiYmFzZW5hbWUiLCJpbmRleE9mIiwiZXh0bmFtZSIsIm1vZHVsZSIsInBhcmVudCIsInByb2Nlc3MiLCJjb25zb2xlIiwiZXJyb3IiLCJzdGFjayIsIkVycm9yIiwid2F0Y2hlciIsInN0b3AiLCJ0aW1lc3RhbXAiLCJvYiIsImV2ZW50IiwibG9nIiwic29ydCJdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7O0FBS0E7OztBQUdBOzs7Ozs7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7Ozs7Ozs7OztBQUVBLElBQU1BLFFBQVEscUJBQU8sZUFBUCxDQUFkOztBQUVBLGdCQUFNQyxNQUFOLENBQWEsNEZBQWIsRUFBMkc7QUFDMUdDLFVBQVNDLFFBQVEsaUJBQVIsRUFBMkJDLE9BRHNFO0FBRTFHQyxrQkFBaUI7QUFGeUYsQ0FBM0csRUFHR0MsT0FISDs7QUFLQTs7OztBQUlBLElBQU1DLGdCQUFnQixJQUF0QjtBQUNBOzs7O0FBSUEsSUFBTUMsbUJBQW1CLGVBQUtDLElBQUwsQ0FDeEIsYUFBR0MsT0FBSCxFQUR3QixFQUV4QixhQUZ3QixFQUd4Qix1QkFId0IsRUFJeEIsaUJBSndCLENBQXpCO0FBTUE7Ozs7O0lBSWFDLFUsV0FBQUEsVTs7O0FBQ1o7Ozs7O0FBS0EscUJBQVlDLE9BQVosRUFBcUJDLFFBQXJCLEVBQStCO0FBQUE7O0FBQUE7O0FBRzlCLFFBQUtDLFFBQUwsR0FBZ0JGLFdBQVdKLGdCQUEzQjtBQUNBLFFBQUtPLE9BQUwsR0FBZUMsY0FBZjtBQUNBLFFBQUtDLFNBQUwsR0FBaUJKLFlBQVksQ0FBN0I7QUFDQSxRQUFLSyxhQUFMLEdBQXFCLEVBQXJCO0FBQ0EsUUFBS0MsSUFBTCxHQUFZLEVBQVo7QUFDQSxRQUFLQyxHQUFMLEdBQVcsSUFBWDtBQUNBLFFBQUtDLE1BQUwsR0FBYyxJQUFkO0FBQ0Es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LElBQUltRSxLQUFKLElBQWFuRSxHQUEzQjtBQUNBLFFBQU0sSUFBSW9FLEtBQUosQ0FBVXBFLElBQUltRSxLQUFKLElBQWFuRSxHQUF2QixDQUFOO0FBQ0EsRUFKRDtBQUtBcUUsU0FBUW5DLEVBQVIsQ0FBVyxNQUFYLEVBQW1CLGVBQU87QUFDekJVLE1BQUl4QyxPQUFKLENBQVksY0FBTTtBQUFBLE9BQ1ZtRSxTQURVLEdBQ1VDLEVBRFYsQ0FDVkQsU0FEVTtBQUFBLE9BQ0NFLEtBREQsR0FDVUQsRUFEVixDQUNDQyxLQUREOztBQUVqQlIsV0FBUVMsR0FBUixDQUFZLE9BQU9ILFNBQW5CLEVBQThCRSxLQUE5QjtBQUNBLFVBQU9ELEdBQUdELFNBQVY7QUFDQSxVQUFPQyxHQUFHQyxLQUFWO0FBQ0F2RSxVQUFPQyxJQUFQLENBQVlxRSxFQUFaLEVBQWdCRyxJQUFoQixHQUF1QnZFLE9BQXZCLENBQStCLGFBQUs7QUFDbkM7QUFDQSxJQUZEO0FBR0EsR0FSRDtBQVNBLEVBVkQ7QUFXQSIsImZpbGUiOiJsb2ctd2F0Y2hlci5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGZpbGUgVGhlIGZpbGUgdGhhdCBkb2VzIHRoZSB3YXRjaGVyIHByb2Nlc3NpbmcuXG4gKiBAYXV0aG9yIHdpbGx5YjMyMVxuICogQGNvcHlyaWdodCBNSVRcbiAqL1xuLyoqXG4gKiBAbW9kdWxlIFdhdGNoZXJcbiAqL1xuJ3VzZSBzdHJpY3QnO1xuaW1wb3J0IGV2ZW50cyBmcm9tICdldmVudHMnO1xuaW1wb3J0IG9zIGZyb20gJ29zJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBkZWJ1ZzAgZnJvbSAnZGVidWcnO1xuaW1wb3J0IFJhdmVuIGZyb20gJ3JhdmVuJztcblxuY29uc3QgZGVidWcgPSBkZWJ1ZzAoJ2VkLWxvZ3dhdGNoZXInKTtcblxuUmF2ZW4uY29uZmlnKCdodHRwczovLzQwMzJjZjkyMDI1NTQyMTFhNzA1NjU5YTY3YjE0NWNkOjY4ZWMzZWJlYWM4ZDQ4ODI5OGRiOGUyMjRhOWQ0YTJkQHNlbnRyeS5pby8yMjk3NjgnLCB7XG5cdHJlbGVhc2U6IHJlcXVpcmUoJy4uL3BhY2thZ2UuanNvbicpLnZlcnNpb24sXG5cdGF1dG9CcmVhZGNydW1iczogdHJ1ZVxufSkuaW5zdGFsbCgpO1xuXG4vKipcbiAqIEludGVydmFsIGluIE1TIHRvIHBvbGwgZGlyZWN0b3J5IGF0LlxuICogQHR5cGUge251bWJlcn1cbiAqL1xuY29uc3QgUE9MTF9JTlRFUlZBTCA9IDEwMDA7XG4vKipcbiAqIERlZmF1bHQgcGF0aCB0byBqb3VybmFsIGZpbGVzIGZvciBFbGl0ZS5cbiAqIEB0eXBlIHtzdHJpbmd9XG4gKi9cbmNvbnN0IERFRkFVTFRfU0FWRV9ESVIgPSBwYXRoLmpvaW4oXG5cdG9zLmhvbWVkaXIoKSxcblx0J1NhdmVkIEdhbWVzJyxcblx0J0Zyb250aWVyIERldmVsb3BtZW50cycsXG5cdCdFbGl0ZSBEYW5nZXJvdXMnXG4pO1xuLyoqXG4gKiBAY2xhc3MgVGhlIG1haW4gY2xhc3MuXG4gKiBAdHV0b3JpYWwgTG9nV2F0Y2hlci1UdXRvcmlhbFxuICovXG5leHBvcnQgY2xhc3MgTG9nV2F0Y2hlciBleHRlbmRzIGV2ZW50cy5FdmVudEVtaXR0ZXIge1xuXHQvKipcblx0ICogQ29uc3RydWN0IHRoZSBsb2cgd2F0Y2hlci5cblx0ICogQHBhcmFtIGRpcnBhdGgge3N0cmluZ30gVGhlIGRpcmVjdG9yeSB0byB3YXRjaC5cblx0ICogQHBhcmFtIG1heGZpbGVzIHtudW1iZXJ9IE1heGltdW0gYW1vdW50IG9mIGZpbGVzIHRvIHByb2Nlc3MuXG5cdCAqL1xuXHRjb25zdHJ1Y3RvcihkaXJwYXRoLCBtYXhmaWxlcykge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9kaXJwYXRoID0gZGlycGF0aCB8fCBERUZBVUxUX1NBVkVfRElSO1xuXHRcdHRoaXMuX2ZpbHRlciA9IGlzQ29tbWFuZGVyTG9nO1xuXHRcdHRoaXMuX21heGZpbGVzID0gbWF4ZmlsZXMgfHwgMztcblx0XHR0aGlzLl9sb2dEZXRhaWxNYXAgPSB7fTtcblx0XHR0aGlzLl9vcHMgPSBbXTtcblx0XHR0aGlzLl9vcCA9IG51bGw7XG5cdFx0dGhpcy5fdGltZXIgPSBudWxsO1xuXHRcdHRoaXMuX2RpZSA9IGZhbHNlO1xuXG5cdFx0dGhpcy5fbG9vcCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1cnkgYSBmaWxlXG5cdCAqIEBwYXJhbSBmaWxlbmFtZSB7c3RyaW5nfSBGaWxlIHRvIGJ1cnkuXG5cdCAqL1xuXHRidXJ5KGZpbGVuYW1lKSB7XG5cdFx0ZGVidWcoJ2J1cnknLCB7ZmlsZW5hbWV9KTtcblx0XHR0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdLnRvbWJzdG9uZWQgPSB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0b3AgcnVubmluZ1xuXHQgKi9cblx0c3RvcCgpIHtcblx0XHRkZWJ1Zygnc3RvcCcpO1xuXG5cdFx0aWYgKHRoaXMuX29wID09PSBudWxsKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fdGltZXIpO1xuXHRcdFx0dGhpcy5lbWl0KCdzdG9wcGVkJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX29wcy5zcGxpY2UodGhpcy5fb3BzLmxlbmd0aCk7XG5cdFx0XHR0aGlzLl9kaWUgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbWFpbiBsb29wXG5cdCAqL1xuXHRfbG9vcCgpIHtcblx0XHRkZWJ1ZygnX2xvb3AnLCB7b3Bjb3VudDogdGhpcy5fb3BzLmxlbmd0aH0pO1xuXG5cdFx0dGhpcy5fb3AgPSBudWxsO1xuXG5cdFx0aWYgKHRoaXMuX29wcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX3RpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX29wcy5wdXNoKGNhbGxiYWNrID0+IHRoaXMuX3BvbGwoY2FsbGJhY2spKTtcblx0XHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuX2xvb3AoKSk7XG5cdFx0XHR9LCBQT0xMX0lOVEVSVkFMKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9vcCA9IHRoaXMuX29wcy5zaGlmdCgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX29wKGVyciA9PiB7XG5cdFx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9kaWUpIHtcblx0XHRcdFx0XHR0aGlzLmVtaXQoJ3N0b3BwZWQnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gdGhpcy5fbG9vcCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKTtcblx0XHRcdFx0Ly8gQXNzdW1wdGlvbjogaXQgY3Jhc2hlZCBCRUZPUkUgYW4gYXN5bmMgd2FpdFxuXHRcdFx0XHQvLyBvdGhlcndpc2UsIHdlJ2xsIGVuZCB1cCB3aXRoIG1vcmUgc2ltdWx0YW5lb3VzXG5cdFx0XHRcdC8vIGFjdGl2aXR5XG5cdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gdGhpcy5fbG9vcCgpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUG9sbCB0aGUgbG9ncyBkaXJlY3RvcnkgZm9yIG5ldy91cGRhdGVkIGZpbGVzLlxuXHQgKiBAcGFyYW0gY2FsbGJhY2sge2Z1bmN0aW9ufVxuXHQgKi9cblx0X3BvbGwoY2FsbGJhY2spIHtcblx0XHRkZWJ1ZygnX3BvbGwnKTtcblxuXHRcdGNvbnN0IHVuc2VlbiA9IHt9O1xuXHRcdE9iamVjdC5rZXlzKHRoaXMuX2xvZ0RldGFpbE1hcCkuZm9yRWFjaChmaWxlbmFtZSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0udG9tYnN0b25lZCkge1xuXHRcdFx0XHR1bnNlZW5bZmlsZW5hbWVdID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGZzLnJlYWRkaXIodGhpcy5fZGlycGF0aCwgKGVyciwgZmlsZW5hbWVzKSA9PiB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdGNhbGxiYWNrKGVycik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBmaWxlcyA9IGZpbGVuYW1lcy5zbGljZShmaWxlbmFtZXMubGVuZ3RoIC0gdGhpcy5fbWF4ZmlsZXMsIGZpbGVuYW1lcy5sZW5ndGgpO1xuXHRcdFx0XHRmaWxlcy5mb3JFYWNoKGZpbGVuYW1lID0+IHtcblx0XHRcdFx0XHRmaWxlbmFtZSA9IHBhdGguam9pbih0aGlzLl9kaXJwYXRoLCBmaWxlbmFtZSk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2ZpbHRlcihmaWxlbmFtZSkpIHtcblx0XHRcdFx0XHRcdGRlbGV0ZSB1bnNlZW5bZmlsZW5hbWVdO1xuXHRcdFx0XHRcdFx0dGhpcy5fb3BzLnB1c2goY2IgPT4gdGhpcy5fc3RhdGZpbGUoZmlsZW5hbWUsIGNiKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRPYmplY3Qua2V5cyh1bnNlZW4pLmZvckVhY2goZmlsZW5hbWUgPT4ge1xuXHRcdFx0XHRcdHRoaXMuYnVyeShmaWxlbmFtZSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNhbGxiYWNrKG51bGwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0YXQgdGhlIG5ldy91cGRhdGVkIGZpbGVzIGluIGxvZyBkaXJlY3Rvcnlcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IFBhdGggdG8gZmlsZSB0byBnZXQgc3RhdHMgb2YuXG5cdCAqIEBwYXJhbSBjYWxsYmFja1xuXHQgKi9cblx0X3N0YXRmaWxlKGZpbGVuYW1lLCBjYWxsYmFjaykge1xuXHRcdGRlYnVnKCdfc3RhdGZpbGUnLCB7ZmlsZW5hbWV9KTtcblxuXHRcdGZzLnN0YXQoZmlsZW5hbWUsIChlcnIsIHN0YXRzKSA9PiB7XG5cdFx0XHRpZiAoZXJyICYmIGVyci5jb2RlID09PSAnRU5PRU5UJykge1xuXHRcdFx0XHRpZiAodGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXSkge1xuXHRcdFx0XHRcdHRoaXMuYnVyeShmaWxlbmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FsbGJhY2sobnVsbCk7IC8vIEZpbGUgZGVsZXRlZFxuXHRcdFx0fSBlbHNlIGlmIChlcnIpIHtcblx0XHRcdFx0Y2FsbGJhY2soZXJyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29wcy5wdXNoKGNiID0+IHRoaXMuX3Byb2Nlc3MoZmlsZW5hbWUsIHN0YXRzLCBjYikpO1xuXHRcdFx0XHRjYWxsYmFjayhudWxsKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm9jZXNzIHRoZSBmaWxlc1xuXHQgKiBAcGFyYW0gZmlsZW5hbWUge3N0cmluZ30gRmlsZW5hbWUgdG8gY2hlY2tcblx0ICogQHBhcmFtIHN0YXRzIHtvYmplY3R9IExhc3QgbW9kaWZpZWQgZXRjXG5cdCAqIEBwYXJhbSBjYWxsYmFjayB7ZnVuY3Rpb259XG5cdCAqL1xuXHRfcHJvY2VzcyhmaWxlbmFtZSwgc3RhdHMsIGNhbGxiYWNrKSB7XG5cdFx0ZGVidWcoJ19wcm9jZXNzJywge2ZpbGVuYW1lLCBzdGF0c30pO1xuXHRcdGxldCBDVVJSRU5UX0ZJTEUgPSAwO1xuXHRcdHNldEltbWVkaWF0ZShjYWxsYmFjaywgbnVsbCk7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV07XG5cblx0XHRpZiAoaW5mbyA9PT0gdW5kZWZpbmVkICYmIENVUlJFTlRfRklMRSA8IHRoaXMuX21heGZpbGVzKSB7XG5cdFx0XHR0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdID0ge1xuXHRcdFx0XHRpbm86IHN0YXRzLmlubyxcblx0XHRcdFx0bXRpbWU6IHN0YXRzLm10aW1lLFxuXHRcdFx0XHRzaXplOiBzdGF0cy5zaXplLFxuXHRcdFx0XHR3YXRlcm1hcms6IDAsXG5cdFx0XHRcdHRvbWJzdG9uZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0Q1VSUkVOVF9GSUxFKys7XG5cdFx0XHR0aGlzLl9vcHMucHVzaChjYiA9PiB0aGlzLl9yZWFkKGZpbGVuYW1lLCBjYikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpbmZvLnRvbWJzdG9uZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaW5mby5pbm8gIT09IHN0YXRzLmlubykge1xuXHRcdFx0XHQvLyBGaWxlIHJlcGxhY2VkLi4uIGNhbid0IHRydXN0IGl0IGFueSBtb3JlXG5cdFx0XHRcdC8vIGlmIHRoZSBjbGllbnQgQVBJIHN1cHBvcnRlZCByZXBsYXkgZnJvbSBzY3JhdGNoLCB3ZSBjb3VsZCBkbyB0aGF0XG5cdFx0XHRcdC8vIGJ1dCB3ZSBjYW4ndCB5ZXQsIHNvOlxuXHRcdFx0Q1VSUkVOVF9GSUxFID0gMDtcblx0XHRcdHRoaXMuYnVyeShmaWxlbmFtZSk7XG5cdFx0fSBlbHNlIGlmIChzdGF0cy5zaXplID4gaW5mby5zaXplKSB7XG5cdFx0XHRcdC8vIEZpbGUgbm90IHJlcGxhY2VkOyBnb3QgbG9uZ2VyLi4uIGFzc3VtZSBhcHBlbmRcblx0XHRcdHRoaXMuX29wcy5wdXNoKGNiID0+IHRoaXMuX3JlYWQoZmlsZW5hbWUsIGNiKSk7XG5cdFx0fSBlbHNlIGlmIChpbmZvLmlubyA9PT0gc3RhdHMuaW5vICYmIGluZm8uc2l6ZSA9PT0gc3RhdHMuc2l6ZSkge1xuXHRcdFx0XHQvLyBFdmVuIGlmIG10aW1lIGlzIGRpZmZlcmVudCwgdHJlYXQgaXQgYXMgdW5jaGFuZ2VkXG5cdFx0XHRcdC8vIGUuZy4gXlogd2hlbiBDT1BZIENPTiB0byBhIGZha2UgbG9nXG5cdFx0XHRcdC8vIGRvbid0IHF1ZXVlIHJlYWRcblx0XHR9XG5cblx0XHRpbmZvLm10aW1lID0gc3RhdHMubXRpbWU7XG5cdFx0aW5mby5zaXplID0gc3RhdHMuc2l6ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkIHRoZSBmaWxlc1xuXHQgKiBAcGFyYW0gZmlsZW5hbWUge3N0cmluZ30gVGhlIGZpbGVuYW1lIHRvIHJlYWQuXG5cdCAqIEBwYXJhbSBjYWxsYmFjayB7ZnVuY3Rpb259XG5cdCAqL1xuXHRfcmVhZChmaWxlbmFtZSwgY2FsbGJhY2spIHtcblx0XHRjb25zdCB7d2F0ZXJtYXJrLCBzaXplfSA9IHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV07XG5cdFx0ZGVidWcoJ19yZWFkJywge2ZpbGVuYW1lLCB3YXRlcm1hcmssIHNpemV9KTtcblx0XHRsZXQgbGVmdG92ZXIgPSBCdWZmZXIuZnJvbSgnJywgJ3V0ZjgnKTtcblxuXHRcdGNvbnN0IHMgPSBmcy5jcmVhdGVSZWFkU3RyZWFtKGZpbGVuYW1lLCB7XG5cdFx0XHRmbGFnczogJ3InLFxuXHRcdFx0c3RhcnQ6IHdhdGVybWFyayxcblx0XHRcdGVuZDogc2l6ZVxuXHRcdH0pO1xuXHRcdGNvbnN0IGZpbmlzaCA9IGVyciA9PiB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0Ly8gT24gYW55IGVycm9yLCBlbWl0IHRoZSBlcnJvciBhbmQgYnVyeSB0aGUgZmlsZS5cblx0XHRcdFx0dGhpcy5lbWl0KCdlcnJvcicsIGVycik7XG5cdFx0XHRcdHRoaXMuYnVyeShmaWxlbmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRzZXRJbW1lZGlhdGUoY2FsbGJhY2ssIG51bGwpO1xuXHRcdFx0Y2FsbGJhY2sgPSAoKSA9PiB7XG5cdFx0XHR9OyAvLyBOby1vcFxuXHRcdH07XG5cdFx0cy5vbmNlKCdlcnJvcicsIGZpbmlzaCk7XG5cblx0XHRzLm9uY2UoJ2VuZCcsIGZpbmlzaCk7XG5cblx0XHRzLm9uKCdkYXRhJywgY2h1bmsgPT4ge1xuXHRcdFx0Y29uc3Qgc1RoaXMgPSB0aGlzO1xuXHRcdFx0UmF2ZW4uY29udGV4dChmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdFJhdmVuLmNhcHR1cmVCcmVhZGNydW1iKHtcblx0XHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0XHRjaHVuazogY2h1bmsudG9TdHJpbmcoKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IGNodW5rLmxhc3RJbmRleE9mKCdcXG4nKTtcblx0XHRcdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdFx0XHRsZWZ0b3ZlciA9IEJ1ZmZlci5jb25jYXQoW2xlZnRvdmVyLCBjaHVua10pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNUaGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdLndhdGVybWFyayArPSBpZHggKyAxO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvYnMgPSBCdWZmZXIuY29uY2F0KFtsZWZ0b3ZlciwgY2h1bmsuc2xpY2UoMCwgaWR4ICsgMSldKVxuXHRcdFx0XHRcdFx0XHQudG9TdHJpbmcoJ3V0ZjgnKVxuXHRcdFx0XHRcdFx0XHQucmVwbGFjZSgvXFx1MDAwZS9pZ20sICcnKVxuXHRcdFx0XHRcdFx0XHQucmVwbGFjZSgvXFx1MDAwZi9pZ20sICcnKVxuXHRcdFx0XHRcdFx0XHQuc3BsaXQoL1tcXHJcXG5dKy8pXG5cdFx0XHRcdFx0XHRcdC5maWx0ZXIobCA9PiBsLmxlbmd0aCA+IDApXG5cdFx0XHRcdFx0XHRcdC5tYXAobCA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKGwpXG5cdFx0XHRcdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZGVidWcoJ2pzb24ucGFyc2UgZXJyb3InLCB7bGluZTogbH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0UmF2ZW4uY29udGV4dChmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFJhdmVuLmNhcHR1cmVCcmVhZGNydW1iKHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlOiAnRmlsZSB0aGF0IGNyYXNoZWQgbG9nIHdhdGNoZXInLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGZpbGVuYW1lXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0UmF2ZW4uY2FwdHVyZUJyZWFkY3J1bWIoe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2U6ICdMb2ctd2F0Y2hlciBKU09OLnBhcnNlIGZhaWxlZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0bGluZTogbCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNodW5rOiBjaHVuay50b1N0cmluZygpXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0UmF2ZW4uY2FwdHVyZUV4Y2VwdGlvbihlKTtcblx0XHRcdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGxlZnRvdmVyID0gY2h1bmsuc2xpY2UoaWR4ICsgMSk7XG5cdFx0XHRcdFx0XHRpZiAob2JzKSB7XG5cdFx0XHRcdFx0XHRcdHNldEltbWVkaWF0ZSgoKSA9PiBzVGhpcy5lbWl0KCdkYXRhJywgb2JzKSAmJiBzVGhpcy5lbWl0KCdmaW5pc2hlZCcpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHNldEltbWVkaWF0ZSgoKSA9PiBzVGhpcy5lbWl0KCdkYXRhJywge30pICYmIHNUaGlzLmVtaXQoJ2ZpbmlzaGVkJykpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0ZmluaXNoKGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXHR9XG4vKipcbiAqIEdldCB0aGUgcGF0aCBvZiB0aGUgbG9ncy5cbiAqIEBwYXJhbSBmcGF0aCB7c3RyaW5nfSBQYXRoIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlIGRpcmVjdG9yeSBjb250YWlucyBqb3VybmFsIGZpbGVzLlxuICovXG5mdW5jdGlvbiBpc0NvbW1hbmRlckxvZyhmcGF0aCkge1xuXHRjb25zdCBiYXNlID0gcGF0aC5iYXNlbmFtZShmcGF0aCk7XG5cdHJldHVybiBiYXNlLmluZGV4T2YoJ0pvdXJuYWwuJykgPT09IDAgJiYgcGF0aC5leHRuYW1lKGZwYXRoKSA9PT0gJy5sb2cnO1xufVxuXG5pZiAoIW1vZHVsZS5wYXJlbnQpIHtcblx0cHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCBlcnIgPT4ge1xuXHRcdGNvbnNvbGUuZXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGVyci5zdGFjayB8fCBlcnIpO1xuXHR9KTtcblxuXHRjb25zdCB3YXRjaGVyID0gbmV3IExvZ1dhdGNoZXIoREVGQVVMVF9TQVZFX0RJUiwgMyk7XG5cdHdhdGNoZXIub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHR3YXRjaGVyLnN0b3AoKTtcblx0XHRjb25zb2xlLmVycm9yKGVyci5zdGFjayB8fCBlcnIpO1xuXHRcdHRocm93IG5ldyBFcnJvcihlcnIuc3RhY2sgfHwgZXJyKTtcblx0fSk7XG5cdHdhdGNoZXIub24oJ2RhdGEnLCBvYnMgPT4ge1xuXHRcdG9icy5mb3JFYWNoKG9iID0+IHtcblx0XHRcdGNvbnN0IHt0aW1lc3RhbXAsIGV2ZW50fSA9IG9iO1xuXHRcdFx0Y29uc29sZS5sb2coJ1xcbicgKyB0aW1lc3RhbXAsIGV2ZW50KTtcblx0XHRcdGRlbGV0ZSBvYi50aW1lc3RhbXA7XG5cdFx0XHRkZWxldGUgb2IuZXZlbnQ7XG5cdFx0XHRPYmplY3Qua2V5cyhvYikuc29ydCgpLmZvckVhY2goayA9PiB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKCdcXHQnICsgaywgb2Jba10pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuIl19
