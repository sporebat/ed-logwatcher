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
exports.LogWatcher = void 0;

var _events = _interopRequireDefault(require("events"));

var _os = _interopRequireDefault(require("os"));

var _path = _interopRequireDefault(require("path"));

var _fs = _interopRequireDefault(require("fs"));

var _debug = _interopRequireDefault(require("debug"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var debug = (0, _debug.default)('ed-logwatcher');
/**
 * Interval in MS to poll directory at.
 * @type {number}
 */

var POLL_INTERVAL = 1000;
/**
 * Default path to journal files for Elite.
 * @type {string}
 */

var DEFAULT_SAVE_DIR = _path.default.join(_os.default.homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous');
/**
 * @class The main class.
 * @tutorial LogWatcher-Tutorial
 */


var LogWatcher =
/*#__PURE__*/
function (_events$EventEmitter) {
  _inherits(LogWatcher, _events$EventEmitter);

  /**
   * Construct the log watcher.
   * @param dirpath {string} The directory to watch.
   * @param maxfiles {number} Maximum amount of files to process.
   * @param ignoreInitial {boolean} Ignore initial read or not.
   */
  function LogWatcher(dirpath, maxfiles, ignoreInitial) {
    var _this;

    _classCallCheck(this, LogWatcher);

    _this = _possibleConstructorReturn(this, (LogWatcher.__proto__ || Object.getPrototypeOf(LogWatcher)).call(this));
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
    key: "bury",
    value: function bury(filename) {
      debug('bury', {
        filename: filename
      });
      this._logDetailMap[filename].tombstoned = true;
    }
    /**
     * Stop running
     */

  }, {
    key: "stop",
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
    key: "_loop",
    value: function _loop() {
      var _this2 = this;

      debug('_loop', {
        opcount: this._ops.length
      });
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
        this.emit('error', err); // Assumption: it crashed BEFORE an async wait
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
    key: "_poll",
    value: function _poll(callback) {
      var _this3 = this;

      debug('_poll');
      var unseen = {};
      Object.keys(this._logDetailMap).forEach(function (filename) {
        if (!_this3._logDetailMap[filename].tombstoned) {
          unseen[filename] = true;
        }
      });

      _fs.default.readdir(this._dirpath, function (err, filenames) {
        if (err) {
          callback(err);
        } else {
          var counter = _this3._maxfiles;

          var _loop2 = function _loop2(i) {
            var filename = _path.default.join(_this3._dirpath, filenames[i]);

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
    key: "_statfile",
    value: function _statfile(filename, callback) {
      var _this4 = this;

      debug('_statfile', {
        filename: filename
      });

      _fs.default.stat(filename, function (err, stats) {
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
    key: "_process",
    value: function _process(filename, stats, callback) {
      var _this5 = this;

      debug('_process', {
        filename: filename
      });
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
      } else if (info.ino === stats.ino && info.size === stats.size) {// Even if mtime is different, treat it as unchanged
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
    key: "_read",
    value: function _read(filename, callback) {
      var _this6 = this;

      var _logDetailMap$filenam = this._logDetailMap[filename],
          watermark = _logDetailMap$filenam.watermark,
          size = _logDetailMap$filenam.size;
      debug('_read', {
        filename: filename,
        watermark: watermark,
        size: size
      });
      var leftover = Buffer.from('', 'utf8');

      var s = _fs.default.createReadStream(filename, {
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
                debug('json.parse error', {
                  line: l
                });
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
}(_events.default.EventEmitter);
/**
 * Get the path of the logs.
 * @param fpath {string} Path to check.
 * @returns {boolean} True if the directory contains journal files.
 */


exports.LogWatcher = LogWatcher;

function isCommanderLog(fpath) {
  var base = _path.default.basename(fpath);

  return base.indexOf('Journal.') === 0 && _path.default.extname(fpath) === '.log';
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
      Object.keys(ob).sort().forEach(function (k) {// console.log('\t' + k, ob[k]);
      });
    });
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2ctd2F0Y2hlci5qcyJdLCJuYW1lcyI6WyJkZWJ1ZyIsIlBPTExfSU5URVJWQUwiLCJERUZBVUxUX1NBVkVfRElSIiwiam9pbiIsImhvbWVkaXIiLCJMb2dXYXRjaGVyIiwiZGlycGF0aCIsIm1heGZpbGVzIiwiaWdub3JlSW5pdGlhbCIsIl9kaXJwYXRoIiwiX2ZpbHRlciIsImlzQ29tbWFuZGVyTG9nIiwiX21heGZpbGVzIiwiX2xvZ0RldGFpbE1hcCIsIl9vcHMiLCJfb3AiLCJfc3RhcnRUaW1lIiwiRGF0ZSIsIl90aW1lciIsIl9kaWUiLCJfaWdub3JlSW5pdGlhbCIsInN0b3BwZWQiLCJfbG9vcCIsImVtaXQiLCJmaWxlbmFtZSIsInRvbWJzdG9uZWQiLCJjbGVhclRpbWVvdXQiLCJzcGxpY2UiLCJsZW5ndGgiLCJvcGNvdW50Iiwic2V0VGltZW91dCIsInB1c2giLCJfcG9sbCIsImNhbGxiYWNrIiwic2V0SW1tZWRpYXRlIiwic2hpZnQiLCJlcnIiLCJ1bnNlZW4iLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsInJlYWRkaXIiLCJmaWxlbmFtZXMiLCJjb3VudGVyIiwiaSIsIl9zdGF0ZmlsZSIsImNiIiwiYnVyeSIsInN0YXQiLCJzdGF0cyIsImNvZGUiLCJfcHJvY2VzcyIsIkNVUlJFTlRfRklMRSIsImluZm8iLCJtdGltZSIsInVuZGVmaW5lZCIsImlubyIsInNpemUiLCJ3YXRlcm1hcmsiLCJfcmVhZCIsImxlZnRvdmVyIiwiQnVmZmVyIiwiZnJvbSIsInMiLCJjcmVhdGVSZWFkU3RyZWFtIiwiZmxhZ3MiLCJzdGFydCIsImVuZCIsImZpbmlzaCIsIm9uY2UiLCJvbiIsImlkeCIsImNodW5rIiwibGFzdEluZGV4T2YiLCJjb25jYXQiLCJvYnMiLCJzbGljZSIsInRvU3RyaW5nIiwicmVwbGFjZSIsInNwbGl0IiwiZmlsdGVyIiwibCIsIm1hcCIsIkpTT04iLCJwYXJzZSIsImUiLCJsaW5lIiwiRXZlbnRFbWl0dGVyIiwiZnBhdGgiLCJiYXNlIiwiYmFzZW5hbWUiLCJpbmRleE9mIiwiZXh0bmFtZSIsIm1vZHVsZSIsInBhcmVudCIsInByb2Nlc3MiLCJjb25zb2xlIiwiZXJyb3IiLCJzdGFjayIsIkVycm9yIiwid2F0Y2hlciIsInN0b3AiLCJ0aW1lc3RhbXAiLCJvYiIsImV2ZW50IiwibG9nIiwic29ydCJdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztBQUtBOzs7QUFHQTs7Ozs7OztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsSUFBTUEsUUFBUSxvQkFBTyxlQUFQLENBQWQ7QUFHQTs7Ozs7QUFJQSxJQUFNQyxnQkFBZ0IsSUFBdEI7QUFDQTs7Ozs7QUFJQSxJQUFNQyxtQkFBbUIsY0FBS0MsSUFBTCxDQUN4QixZQUFHQyxPQUFILEVBRHdCLEVBRXhCLGFBRndCLEVBR3hCLHVCQUh3QixFQUl4QixpQkFKd0IsQ0FBekI7QUFNQTs7Ozs7O0lBSWFDLFU7Ozs7O0FBQ1o7Ozs7OztBQU1BLHNCQUFZQyxPQUFaLEVBQXFCQyxRQUFyQixFQUErQkMsYUFBL0IsRUFBOEM7QUFBQTs7QUFBQTs7QUFDN0M7QUFFQSxVQUFLQyxRQUFMLEdBQWdCSCxXQUFXSixnQkFBM0I7QUFDQSxVQUFLUSxPQUFMLEdBQWVDLGNBQWY7QUFDQSxVQUFLQyxTQUFMLEdBQWlCTCxZQUFZLENBQTdCO0FBQ0EsVUFBS00sYUFBTCxHQUFxQixFQUFyQjtBQUNBLFVBQUtDLElBQUwsR0FBWSxFQUFaO0FBQ0EsVUFBS0MsR0FBTCxHQUFXLElBQVg7QUFDQSxVQUFLQyxVQUFMLEdBQWtCLElBQUlDLElBQUosRUFBbEI7QUFDQSxVQUFLQyxNQUFMLEdBQWMsSUFBZDtBQUNBLFVBQUtDLElBQUwsR0FBWSxLQUFaO0FBQ0EsVUFBS0MsY0FBTCxHQUFzQlosaUJBQWlCLEtBQXZDO0FBQ0EsVUFBS2EsT0FBTCxHQUFlLEtBQWY7O0FBQ0EsVUFBS0MsS0FBTDs7QUFDQSxVQUFLQyxJQUFMLENBQVUsU0FBVjs7QUFmNkM7QUFnQjdD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Q1VDLEVBRFYsQ0FDVkQsU0FEVTtBQUFBLFVBQ0NFLEtBREQsR0FDVUQsRUFEVixDQUNDQyxLQUREO0FBRWpCUixjQUFRUyxHQUFSLENBQVksT0FBT0gsU0FBbkIsRUFBOEJFLEtBQTlCO0FBQ0EsYUFBT0QsR0FBR0QsU0FBVjtBQUNBLGFBQU9DLEdBQUdDLEtBQVY7QUFDQWxFLGFBQU9DLElBQVAsQ0FBWWdFLEVBQVosRUFBZ0JHLElBQWhCLEdBQXVCbEUsT0FBdkIsQ0FBK0IsYUFBSyxDQUNuQztBQUNBLE9BRkQ7QUFHQSxLQVJEO0FBU0EsR0FWRDtBQVdBIiwiZmlsZSI6ImxvZy13YXRjaGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIEBmaWxlIFRoZSBmaWxlIHRoYXQgZG9lcyB0aGUgd2F0Y2hlciBwcm9jZXNzaW5nLlxyXG4gKiBAYXV0aG9yIHdpbGx5YjMyMVxyXG4gKiBAY29weXJpZ2h0IE1JVFxyXG4gKi9cclxuLyoqXHJcbiAqIEBtb2R1bGUgV2F0Y2hlclxyXG4gKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG5pbXBvcnQgZXZlbnRzIGZyb20gJ2V2ZW50cyc7XHJcbmltcG9ydCBvcyBmcm9tICdvcyc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xyXG5pbXBvcnQgZGVidWcwIGZyb20gJ2RlYnVnJztcclxuXHJcbmNvbnN0IGRlYnVnID0gZGVidWcwKCdlZC1sb2d3YXRjaGVyJyk7XHJcblxyXG5cclxuLyoqXHJcbiAqIEludGVydmFsIGluIE1TIHRvIHBvbGwgZGlyZWN0b3J5IGF0LlxyXG4gKiBAdHlwZSB7bnVtYmVyfVxyXG4gKi9cclxuY29uc3QgUE9MTF9JTlRFUlZBTCA9IDEwMDA7XHJcbi8qKlxyXG4gKiBEZWZhdWx0IHBhdGggdG8gam91cm5hbCBmaWxlcyBmb3IgRWxpdGUuXHJcbiAqIEB0eXBlIHtzdHJpbmd9XHJcbiAqL1xyXG5jb25zdCBERUZBVUxUX1NBVkVfRElSID0gcGF0aC5qb2luKFxyXG5cdG9zLmhvbWVkaXIoKSxcclxuXHQnU2F2ZWQgR2FtZXMnLFxyXG5cdCdGcm9udGllciBEZXZlbG9wbWVudHMnLFxyXG5cdCdFbGl0ZSBEYW5nZXJvdXMnXHJcbik7XHJcbi8qKlxyXG4gKiBAY2xhc3MgVGhlIG1haW4gY2xhc3MuXHJcbiAqIEB0dXRvcmlhbCBMb2dXYXRjaGVyLVR1dG9yaWFsXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgTG9nV2F0Y2hlciBleHRlbmRzIGV2ZW50cy5FdmVudEVtaXR0ZXIge1xyXG5cdC8qKlxyXG5cdCAqIENvbnN0cnVjdCB0aGUgbG9nIHdhdGNoZXIuXHJcblx0ICogQHBhcmFtIGRpcnBhdGgge3N0cmluZ30gVGhlIGRpcmVjdG9yeSB0byB3YXRjaC5cclxuXHQgKiBAcGFyYW0gbWF4ZmlsZXMge251bWJlcn0gTWF4aW11bSBhbW91bnQgb2YgZmlsZXMgdG8gcHJvY2Vzcy5cclxuXHQgKiBAcGFyYW0gaWdub3JlSW5pdGlhbCB7Ym9vbGVhbn0gSWdub3JlIGluaXRpYWwgcmVhZCBvciBub3QuXHJcblx0ICovXHJcblx0Y29uc3RydWN0b3IoZGlycGF0aCwgbWF4ZmlsZXMsIGlnbm9yZUluaXRpYWwpIHtcclxuXHRcdHN1cGVyKCk7XHJcblxyXG5cdFx0dGhpcy5fZGlycGF0aCA9IGRpcnBhdGggfHwgREVGQVVMVF9TQVZFX0RJUjtcclxuXHRcdHRoaXMuX2ZpbHRlciA9IGlzQ29tbWFuZGVyTG9nO1xyXG5cdFx0dGhpcy5fbWF4ZmlsZXMgPSBtYXhmaWxlcyB8fCAzO1xyXG5cdFx0dGhpcy5fbG9nRGV0YWlsTWFwID0ge307XHJcblx0XHR0aGlzLl9vcHMgPSBbXTtcclxuXHRcdHRoaXMuX29wID0gbnVsbDtcclxuXHRcdHRoaXMuX3N0YXJ0VGltZSA9IG5ldyBEYXRlKCk7XHJcblx0XHR0aGlzLl90aW1lciA9IG51bGw7XHJcblx0XHR0aGlzLl9kaWUgPSBmYWxzZTtcclxuXHRcdHRoaXMuX2lnbm9yZUluaXRpYWwgPSBpZ25vcmVJbml0aWFsIHx8IGZhbHNlO1xyXG5cdFx0dGhpcy5zdG9wcGVkID0gZmFsc2U7XHJcblx0XHR0aGlzLl9sb29wKCk7XHJcblx0XHR0aGlzLmVtaXQoJ1N0YXJ0ZWQnKTtcclxuXHR9XHJcblxyXG5cdC8qKlxyXG5cdCAqIEJ1cnkgYSBmaWxlXHJcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IEZpbGUgdG8gYnVyeS5cclxuXHQgKi9cclxuXHRidXJ5KGZpbGVuYW1lKSB7XHJcblx0XHRkZWJ1ZygnYnVyeScsIHtmaWxlbmFtZX0pO1xyXG5cdFx0dGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXS50b21ic3RvbmVkID0gdHJ1ZTtcclxuXHR9XHJcblxyXG5cdC8qKlxyXG5cdCAqIFN0b3AgcnVubmluZ1xyXG5cdCAqL1xyXG5cdHN0b3AoKSB7XHJcblx0XHRkZWJ1Zygnc3RvcCcpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9vcCA9PT0gbnVsbCkge1xyXG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fdGltZXIpO1xyXG5cdFx0XHR0aGlzLnN0b3BwZWQgPSB0cnVlO1xyXG5cdFx0XHR0aGlzLmVtaXQoJ3N0b3BwZWQnKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMuX29wcy5zcGxpY2UodGhpcy5fb3BzLmxlbmd0aCk7XHJcblx0XHRcdHRoaXMuc3RvcHBlZCA9IHRydWU7XHJcblx0XHRcdHRoaXMuX2RpZSA9IHRydWU7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHQvKipcclxuXHQgKiBUaGUgbWFpbiBsb29wXHJcblx0ICovXHJcblx0X2xvb3AoKSB7XHJcblx0XHRkZWJ1ZygnX2xvb3AnLCB7b3Bjb3VudDogdGhpcy5fb3BzLmxlbmd0aH0pO1xyXG5cclxuXHRcdHRoaXMuX29wID0gbnVsbDtcclxuXHJcblx0XHRpZiAodGhpcy5fb3BzLmxlbmd0aCA9PT0gMCkge1xyXG5cdFx0XHR0aGlzLl90aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG5cdFx0XHRcdHRoaXMuX29wcy5wdXNoKGNhbGxiYWNrID0+IHRoaXMuX3BvbGwoY2FsbGJhY2spKTtcclxuXHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gdGhpcy5fbG9vcCgpKTtcclxuXHRcdFx0fSwgUE9MTF9JTlRFUlZBTCk7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9vcCA9IHRoaXMuX29wcy5zaGlmdCgpO1xyXG5cclxuXHRcdHRyeSB7XHJcblx0XHRcdHRoaXMuX29wKGVyciA9PiB7XHJcblx0XHRcdFx0aWYgKGVycikge1xyXG5cdFx0XHRcdFx0dGhpcy5lbWl0KCdlcnJvcicsIGVycik7XHJcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9kaWUpIHtcclxuXHRcdFx0XHRcdHRoaXMuZW1pdCgnc3RvcHBlZCcpO1xyXG5cdFx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gdGhpcy5fbG9vcCgpKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cdFx0fSBjYXRjaCAoZXJyKSB7XHJcblx0XHRcdHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xyXG5cdFx0XHRcdC8vIEFzc3VtcHRpb246IGl0IGNyYXNoZWQgQkVGT1JFIGFuIGFzeW5jIHdhaXRcclxuXHRcdFx0XHQvLyBvdGhlcndpc2UsIHdlJ2xsIGVuZCB1cCB3aXRoIG1vcmUgc2ltdWx0YW5lb3VzXHJcblx0XHRcdFx0Ly8gYWN0aXZpdHlcclxuXHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuX2xvb3AoKSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHQvKipcclxuXHQgKiBQb2xsIHRoZSBsb2dzIGRpcmVjdG9yeSBmb3IgbmV3L3VwZGF0ZWQgZmlsZXMuXHJcblx0ICogQHBhcmFtIGNhbGxiYWNrIHtmdW5jdGlvbn1cclxuXHQgKi9cclxuXHRfcG9sbChjYWxsYmFjaykge1xyXG5cdFx0ZGVidWcoJ19wb2xsJyk7XHJcblxyXG5cdFx0Y29uc3QgdW5zZWVuID0ge307XHJcblx0XHRPYmplY3Qua2V5cyh0aGlzLl9sb2dEZXRhaWxNYXApLmZvckVhY2goZmlsZW5hbWUgPT4ge1xyXG5cdFx0XHRpZiAoIXRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0udG9tYnN0b25lZCkge1xyXG5cdFx0XHRcdHVuc2VlbltmaWxlbmFtZV0gPSB0cnVlO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHJcblx0XHRmcy5yZWFkZGlyKHRoaXMuX2RpcnBhdGgsIChlcnIsIGZpbGVuYW1lcykgPT4ge1xyXG5cdFx0XHRpZiAoZXJyKSB7XHJcblx0XHRcdFx0Y2FsbGJhY2soZXJyKTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRsZXQgY291bnRlciA9IHRoaXMuX21heGZpbGVzO1xyXG5cdFx0XHRcdGZvciAobGV0IGkgPSBmaWxlbmFtZXMubGVuZ3RoIC0gMTsgaSA+PSAwICYmIGNvdW50ZXI7IGktLSkge1xyXG5cdFx0XHRcdFx0bGV0IGZpbGVuYW1lID0gcGF0aC5qb2luKHRoaXMuX2RpcnBhdGgsIGZpbGVuYW1lc1tpXSk7XHJcblx0XHRcdFx0XHRpZiAodGhpcy5fZmlsdGVyKGZpbGVuYW1lKSkge1xyXG5cdFx0XHRcdFx0XHRjb3VudGVyLS07XHJcblx0XHRcdFx0XHRcdGRlbGV0ZSB1bnNlZW5bZmlsZW5hbWVdO1xyXG5cdFx0XHRcdFx0XHR0aGlzLl9vcHMucHVzaChjYiA9PiB0aGlzLl9zdGF0ZmlsZShmaWxlbmFtZSwgY2IpKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdE9iamVjdC5rZXlzKHVuc2VlbikuZm9yRWFjaChmaWxlbmFtZSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLmJ1cnkoZmlsZW5hbWUpO1xyXG5cdFx0XHRcdH0pO1xyXG5cclxuXHRcdFx0XHRjYWxsYmFjayhudWxsKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHQvKipcclxuXHQgKiBTdGF0IHRoZSBuZXcvdXBkYXRlZCBmaWxlcyBpbiBsb2cgZGlyZWN0b3J5XHJcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IFBhdGggdG8gZmlsZSB0byBnZXQgc3RhdHMgb2YuXHJcblx0ICogQHBhcmFtIGNhbGxiYWNrXHJcblx0ICovXHJcblx0X3N0YXRmaWxlKGZpbGVuYW1lLCBjYWxsYmFjaykge1xyXG5cdFx0ZGVidWcoJ19zdGF0ZmlsZScsIHtmaWxlbmFtZX0pO1xyXG5cclxuXHRcdGZzLnN0YXQoZmlsZW5hbWUsIChlcnIsIHN0YXRzKSA9PiB7XHJcblx0XHRcdGlmIChlcnIgJiYgZXJyLmNvZGUgPT09ICdFTk9FTlQnKSB7XHJcblx0XHRcdFx0aWYgKHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0pIHtcclxuXHRcdFx0XHRcdHRoaXMuYnVyeShmaWxlbmFtZSk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGNhbGxiYWNrKG51bGwpOyAvLyBGaWxlIGRlbGV0ZWRcclxuXHRcdFx0fSBlbHNlIGlmIChlcnIpIHtcclxuXHRcdFx0XHRjYWxsYmFjayhlcnIpO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdHRoaXMuX29wcy5wdXNoKGNiID0+IHRoaXMuX3Byb2Nlc3MoZmlsZW5hbWUsIHN0YXRzLCBjYikpO1xyXG5cdFx0XHRcdGNhbGxiYWNrKG51bGwpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdC8qKlxyXG5cdCAqIFByb2Nlc3MgdGhlIGZpbGVzXHJcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IEZpbGVuYW1lIHRvIGNoZWNrXHJcblx0ICogQHBhcmFtIHN0YXRzIHtvYmplY3R9IExhc3QgbW9kaWZpZWQgZXRjXHJcblx0ICogQHBhcmFtIGNhbGxiYWNrIHtmdW5jdGlvbn1cclxuXHQgKi9cclxuXHRfcHJvY2VzcyhmaWxlbmFtZSwgc3RhdHMsIGNhbGxiYWNrKSB7XHJcblx0XHRkZWJ1ZygnX3Byb2Nlc3MnLCB7ZmlsZW5hbWV9KTtcclxuXHRcdGxldCBDVVJSRU5UX0ZJTEUgPSAwO1xyXG5cdFx0c2V0SW1tZWRpYXRlKGNhbGxiYWNrLCBudWxsKTtcclxuXHRcdGNvbnN0IGluZm8gPSB0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdO1xyXG5cdFx0aWYgKHRoaXMuX2lnbm9yZUluaXRpYWwgJiYgc3RhdHMubXRpbWUgPCB0aGlzLl9zdGFydFRpbWUpIHtcclxuXHRcdFx0cmV0dXJuXHJcblx0XHR9XHJcblx0XHRpZiAoaW5mbyA9PT0gdW5kZWZpbmVkICYmIENVUlJFTlRfRklMRSA8IHRoaXMuX21heGZpbGVzKSB7XHJcblx0XHRcdHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0gPSB7XHJcblx0XHRcdFx0aW5vOiBzdGF0cy5pbm8sXHJcblx0XHRcdFx0bXRpbWU6IHN0YXRzLm10aW1lLFxyXG5cdFx0XHRcdHNpemU6IHN0YXRzLnNpemUsXHJcblx0XHRcdFx0d2F0ZXJtYXJrOiAwLFxyXG5cdFx0XHRcdHRvbWJzdG9uZWQ6IGZhbHNlXHJcblx0XHRcdH07XHJcblx0XHRcdENVUlJFTlRfRklMRSsrO1xyXG5cdFx0XHR0aGlzLl9vcHMucHVzaChjYiA9PiB0aGlzLl9yZWFkKGZpbGVuYW1lLCBjYikpO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKGluZm8udG9tYnN0b25lZCkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKGluZm8uaW5vICE9PSBzdGF0cy5pbm8pIHtcclxuXHRcdFx0XHQvLyBGaWxlIHJlcGxhY2VkLi4uIGNhbid0IHRydXN0IGl0IGFueSBtb3JlXHJcblx0XHRcdFx0Ly8gaWYgdGhlIGNsaWVudCBBUEkgc3VwcG9ydGVkIHJlcGxheSBmcm9tIHNjcmF0Y2gsIHdlIGNvdWxkIGRvIHRoYXRcclxuXHRcdFx0XHQvLyBidXQgd2UgY2FuJ3QgeWV0LCBzbzpcclxuXHRcdFx0Q1VSUkVOVF9GSUxFID0gMDtcclxuXHRcdFx0dGhpcy5idXJ5KGZpbGVuYW1lKTtcclxuXHRcdH0gZWxzZSBpZiAoc3RhdHMuc2l6ZSA+IGluZm8uc2l6ZSkge1xyXG5cdFx0XHRcdC8vIEZpbGUgbm90IHJlcGxhY2VkOyBnb3QgbG9uZ2VyLi4uIGFzc3VtZSBhcHBlbmRcclxuXHRcdFx0dGhpcy5fb3BzLnB1c2goY2IgPT4gdGhpcy5fcmVhZChmaWxlbmFtZSwgY2IpKTtcclxuXHRcdH0gZWxzZSBpZiAoaW5mby5pbm8gPT09IHN0YXRzLmlubyAmJiBpbmZvLnNpemUgPT09IHN0YXRzLnNpemUpIHtcclxuXHRcdFx0XHQvLyBFdmVuIGlmIG10aW1lIGlzIGRpZmZlcmVudCwgdHJlYXQgaXQgYXMgdW5jaGFuZ2VkXHJcblx0XHRcdFx0Ly8gZS5nLiBeWiB3aGVuIENPUFkgQ09OIHRvIGEgZmFrZSBsb2dcclxuXHRcdFx0XHQvLyBkb24ndCBxdWV1ZSByZWFkXHJcblx0XHR9XHJcblxyXG5cdFx0aW5mby5tdGltZSA9IHN0YXRzLm10aW1lO1xyXG5cdFx0aW5mby5zaXplID0gc3RhdHMuc2l6ZTtcclxuXHR9XHJcblxyXG5cdC8qKlxyXG5cdCAqIFJlYWQgdGhlIGZpbGVzXHJcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IFRoZSBmaWxlbmFtZSB0byByZWFkLlxyXG5cdCAqIEBwYXJhbSBjYWxsYmFjayB7ZnVuY3Rpb259XHJcblx0ICovXHJcblx0X3JlYWQoZmlsZW5hbWUsIGNhbGxiYWNrKSB7XHJcblx0XHRjb25zdCB7d2F0ZXJtYXJrLCBzaXplfSA9IHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV07XHJcblx0XHRkZWJ1ZygnX3JlYWQnLCB7ZmlsZW5hbWUsIHdhdGVybWFyaywgc2l6ZX0pO1xyXG5cdFx0bGV0IGxlZnRvdmVyID0gQnVmZmVyLmZyb20oJycsICd1dGY4Jyk7XHJcblxyXG5cdFx0Y29uc3QgcyA9IGZzLmNyZWF0ZVJlYWRTdHJlYW0oZmlsZW5hbWUsIHtcclxuXHRcdFx0ZmxhZ3M6ICdyJyxcclxuXHRcdFx0c3RhcnQ6IHdhdGVybWFyayxcclxuXHRcdFx0ZW5kOiBzaXplXHJcblx0XHR9KTtcclxuXHRcdGNvbnN0IGZpbmlzaCA9IGVyciA9PiB7XHJcblx0XHRcdGlmIChlcnIpIHtcclxuXHRcdFx0XHRcdC8vIE9uIGFueSBlcnJvciwgZW1pdCB0aGUgZXJyb3IgYW5kIGJ1cnkgdGhlIGZpbGUuXHJcblx0XHRcdFx0dGhpcy5lbWl0KCdlcnJvcicsIGVycik7XHJcblx0XHRcdFx0dGhpcy5idXJ5KGZpbGVuYW1lKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRzZXRJbW1lZGlhdGUoY2FsbGJhY2ssIG51bGwpO1xyXG5cdFx0XHRjYWxsYmFjayA9ICgpID0+IHtcclxuXHRcdFx0fTsgLy8gTm8tb3BcclxuXHRcdH07XHJcblx0XHRzLm9uY2UoJ2Vycm9yJywgZmluaXNoKTtcclxuXHJcblx0XHRzLm9uY2UoJ2VuZCcsIGZpbmlzaCk7XHJcblxyXG5cdFx0cy5vbignZGF0YScsIGNodW5rID0+IHtcclxuXHRcdFx0XHRjb25zdCBpZHggPSBjaHVuay5sYXN0SW5kZXhPZignXFxuJyk7XHJcblx0XHRcdFx0aWYgKGlkeCA8IDApIHtcclxuXHRcdFx0XHRcdGxlZnRvdmVyID0gQnVmZmVyLmNvbmNhdChbbGVmdG92ZXIsIGNodW5rXSk7XHJcblx0XHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRcdHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0ud2F0ZXJtYXJrICs9IGlkeCArIDE7XHJcblx0XHRcdFx0XHR0cnkge1xyXG5cdFx0XHRcdFx0XHRjb25zdCBvYnMgPSBCdWZmZXIuY29uY2F0KFtsZWZ0b3ZlciwgY2h1bmsuc2xpY2UoMCwgaWR4ICsgMSldKVxyXG5cdFx0XHRcdFx0XHRcdC50b1N0cmluZygndXRmOCcpXHJcblx0XHRcdFx0XHRcdFx0LnJlcGxhY2UoL1xcdTAwMGUvaWdtLCAnJylcclxuXHRcdFx0XHRcdFx0XHQucmVwbGFjZSgvXFx1MDAwZi9pZ20sICcnKVxyXG5cdFx0XHRcdFx0XHRcdC5zcGxpdCgvW1xcclxcbl0rLylcclxuXHRcdFx0XHRcdFx0XHQuZmlsdGVyKGwgPT4gbC5sZW5ndGggPiAwKVxyXG5cdFx0XHRcdFx0XHRcdC5tYXAobCA9PiB7XHJcblx0XHRcdFx0XHRcdFx0XHR0cnkge1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShsKVxyXG5cdFx0XHRcdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRkZWJ1ZygnanNvbi5wYXJzZSBlcnJvcicsIHtsaW5lOiBsfSk7XHJcblx0XHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdFx0fSk7XHJcblx0XHRcdFx0XHRcdGxlZnRvdmVyID0gY2h1bmsuc2xpY2UoaWR4ICsgMSk7XHJcblx0XHRcdFx0XHRcdGlmIChvYnMpIHtcclxuXHRcdFx0XHRcdFx0XHRkZWJ1ZygnZGF0YSBlbWl0Jyk7XHJcblx0XHRcdFx0XHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuZW1pdCgnZGF0YScsIG9icykgJiYgdGhpcy5lbWl0KCdmaW5pc2hlZCcpKTtcclxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnKCdkYXRhIGVtaXQnKTtcclxuXHRcdFx0XHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gdGhpcy5lbWl0KCdkYXRhJywge30pICYmIHRoaXMuZW1pdCgnZmluaXNoZWQnKSk7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xyXG5cdFx0XHRcdFx0XHRmaW5pc2goZXJyKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cdH1cclxufVxyXG4vKipcclxuICogR2V0IHRoZSBwYXRoIG9mIHRoZSBsb2dzLlxyXG4gKiBAcGFyYW0gZnBhdGgge3N0cmluZ30gUGF0aCB0byBjaGVjay5cclxuICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlIGRpcmVjdG9yeSBjb250YWlucyBqb3VybmFsIGZpbGVzLlxyXG4gKi9cclxuZnVuY3Rpb24gaXNDb21tYW5kZXJMb2coZnBhdGgpIHtcclxuXHRjb25zdCBiYXNlID0gcGF0aC5iYXNlbmFtZShmcGF0aCk7XHJcblx0cmV0dXJuIGJhc2UuaW5kZXhPZignSm91cm5hbC4nKSA9PT0gMCAmJiBwYXRoLmV4dG5hbWUoZnBhdGgpID09PSAnLmxvZyc7XHJcbn1cclxuXHJcbmlmICghbW9kdWxlLnBhcmVudCkge1xyXG5cdHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgZXJyID0+IHtcclxuXHRcdGNvbnNvbGUuZXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XHJcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XHJcblx0fSk7XHJcblxyXG5cdGNvbnN0IHdhdGNoZXIgPSBuZXcgTG9nV2F0Y2hlcihERUZBVUxUX1NBVkVfRElSLCAzLCB0cnVlKTtcclxuXHR3YXRjaGVyLm9uKCdlcnJvcicsIGVyciA9PiB7XHJcblx0XHR3YXRjaGVyLnN0b3AoKTtcclxuXHRcdGNvbnNvbGUuZXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XHJcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XHJcblx0fSk7XHJcblx0d2F0Y2hlci5vbignZGF0YScsIG9icyA9PiB7XHJcblx0XHRvYnMuZm9yRWFjaChvYiA9PiB7XHJcblx0XHRcdGNvbnN0IHt0aW1lc3RhbXAsIGV2ZW50fSA9IG9iO1xyXG5cdFx0XHRjb25zb2xlLmxvZygnXFxuJyArIHRpbWVzdGFtcCwgZXZlbnQpO1xyXG5cdFx0XHRkZWxldGUgb2IudGltZXN0YW1wO1xyXG5cdFx0XHRkZWxldGUgb2IuZXZlbnQ7XHJcblx0XHRcdE9iamVjdC5rZXlzKG9iKS5zb3J0KCkuZm9yRWFjaChrID0+IHtcclxuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnXFx0JyArIGssIG9iW2tdKTtcclxuXHRcdFx0fSk7XHJcblx0XHR9KTtcclxuXHR9KTtcclxufVxyXG4iXX0=
