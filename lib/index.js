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
          var files = filenames.slice(filenames.length - _this3._maxfiles, filenames.length);
          files.forEach(function (filename) {
            filename = _path.default.join(_this3._dirpath, filename);

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2ctd2F0Y2hlci5qcyJdLCJuYW1lcyI6WyJkZWJ1ZyIsIlBPTExfSU5URVJWQUwiLCJERUZBVUxUX1NBVkVfRElSIiwiam9pbiIsImhvbWVkaXIiLCJMb2dXYXRjaGVyIiwiZGlycGF0aCIsIm1heGZpbGVzIiwiaWdub3JlSW5pdGlhbCIsIl9kaXJwYXRoIiwiX2ZpbHRlciIsImlzQ29tbWFuZGVyTG9nIiwiX21heGZpbGVzIiwiX2xvZ0RldGFpbE1hcCIsIl9vcHMiLCJfb3AiLCJfc3RhcnRUaW1lIiwiRGF0ZSIsIl90aW1lciIsIl9kaWUiLCJfaWdub3JlSW5pdGlhbCIsInN0b3BwZWQiLCJfbG9vcCIsImVtaXQiLCJmaWxlbmFtZSIsInRvbWJzdG9uZWQiLCJjbGVhclRpbWVvdXQiLCJzcGxpY2UiLCJsZW5ndGgiLCJvcGNvdW50Iiwic2V0VGltZW91dCIsInB1c2giLCJfcG9sbCIsImNhbGxiYWNrIiwic2V0SW1tZWRpYXRlIiwic2hpZnQiLCJlcnIiLCJ1bnNlZW4iLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsInJlYWRkaXIiLCJmaWxlbmFtZXMiLCJmaWxlcyIsInNsaWNlIiwiX3N0YXRmaWxlIiwiY2IiLCJidXJ5Iiwic3RhdCIsInN0YXRzIiwiY29kZSIsIl9wcm9jZXNzIiwiQ1VSUkVOVF9GSUxFIiwiaW5mbyIsIm10aW1lIiwidW5kZWZpbmVkIiwiaW5vIiwic2l6ZSIsIndhdGVybWFyayIsIl9yZWFkIiwibGVmdG92ZXIiLCJCdWZmZXIiLCJmcm9tIiwicyIsImNyZWF0ZVJlYWRTdHJlYW0iLCJmbGFncyIsInN0YXJ0IiwiZW5kIiwiZmluaXNoIiwib25jZSIsIm9uIiwiaWR4IiwiY2h1bmsiLCJsYXN0SW5kZXhPZiIsImNvbmNhdCIsIm9icyIsInRvU3RyaW5nIiwicmVwbGFjZSIsInNwbGl0IiwiZmlsdGVyIiwibCIsIm1hcCIsIkpTT04iLCJwYXJzZSIsImUiLCJsaW5lIiwiRXZlbnRFbWl0dGVyIiwiZnBhdGgiLCJiYXNlIiwiYmFzZW5hbWUiLCJpbmRleE9mIiwiZXh0bmFtZSIsIm1vZHVsZSIsInBhcmVudCIsInByb2Nlc3MiLCJjb25zb2xlIiwiZXJyb3IiLCJzdGFjayIsIkVycm9yIiwid2F0Y2hlciIsInN0b3AiLCJ0aW1lc3RhbXAiLCJvYiIsImV2ZW50IiwibG9nIiwic29ydCJdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztBQUtBOzs7QUFHQTs7Ozs7OztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsSUFBTUEsUUFBUSxvQkFBTyxlQUFQLENBQWQ7QUFHQTs7Ozs7QUFJQSxJQUFNQyxnQkFBZ0IsSUFBdEI7QUFDQTs7Ozs7QUFJQSxJQUFNQyxtQkFBbUIsY0FBS0MsSUFBTCxDQUN4QixZQUFHQyxPQUFILEVBRHdCLEVBRXhCLGFBRndCLEVBR3hCLHVCQUh3QixFQUl4QixpQkFKd0IsQ0FBekI7QUFNQTs7Ozs7O0lBSWFDLFU7Ozs7O0FBQ1o7Ozs7OztBQU1BLHNCQUFZQyxPQUFaLEVBQXFCQyxRQUFyQixFQUErQkMsYUFBL0IsRUFBOEM7QUFBQTs7QUFBQTs7QUFDN0M7QUFFQSxVQUFLQyxRQUFMLEdBQWdCSCxXQUFXSixnQkFBM0I7QUFDQSxVQUFLUSxPQUFMLEdBQWVDLGNBQWY7QUFDQSxVQUFLQyxTQUFMLEdBQWlCTCxZQUFZLENBQTdCO0FBQ0EsVUFBS00sYUFBTCxHQUFxQixFQUFyQjtBQUNBLFVBQUtDLElBQUwsR0FBWSxFQUFaO0FBQ0EsVUFBS0MsR0FBTCxHQUFXLElBQVg7QUFDQSxVQUFLQyxVQUFMLEdBQWtCLElBQUlDLElBQUosRUFBbEI7QUFDQSxVQUFLQyxNQUFMLEdBQWMsSUFBZDtBQUNBLFVBQUtDLElBQUwsR0FBWSxLQUFaO0FBQ0EsVUFBS0MsY0FBTCxHQUFzQlosaUJBQWlCLEtBQXZDO0FBQ0EsVUFBS2EsT0FBTCxHQUFlLEtBQWY7O0FBQ0EsVUFBS0MsS0FBTDs7QUFDQSxVQUFLQyxJQUFMLENBQVUsU0FBVjs7QUFmNkM7QUFnQjdDO0FBRUQ7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R0FBUixDQUFZLE9BQU9ILFNBQW5CLEVBQThCRSxLQUE5QjtBQUNBLGFBQU9ELEdBQUdELFNBQVY7QUFDQSxhQUFPQyxHQUFHQyxLQUFWO0FBQ0FqRSxhQUFPQyxJQUFQLENBQVkrRCxFQUFaLEVBQWdCRyxJQUFoQixHQUF1QmpFLE9BQXZCLENBQStCLGFBQUssQ0FDbkM7QUFDQSxPQUZEO0FBR0EsS0FSRDtBQVNBLEdBVkQ7QUFXQSIsImZpbGUiOiJsb2ctd2F0Y2hlci5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGZpbGUgVGhlIGZpbGUgdGhhdCBkb2VzIHRoZSB3YXRjaGVyIHByb2Nlc3NpbmcuXG4gKiBAYXV0aG9yIHdpbGx5YjMyMVxuICogQGNvcHlyaWdodCBNSVRcbiAqL1xuLyoqXG4gKiBAbW9kdWxlIFdhdGNoZXJcbiAqL1xuJ3VzZSBzdHJpY3QnO1xuaW1wb3J0IGV2ZW50cyBmcm9tICdldmVudHMnO1xuaW1wb3J0IG9zIGZyb20gJ29zJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBkZWJ1ZzAgZnJvbSAnZGVidWcnO1xuXG5jb25zdCBkZWJ1ZyA9IGRlYnVnMCgnZWQtbG9nd2F0Y2hlcicpO1xuXG5cbi8qKlxuICogSW50ZXJ2YWwgaW4gTVMgdG8gcG9sbCBkaXJlY3RvcnkgYXQuXG4gKiBAdHlwZSB7bnVtYmVyfVxuICovXG5jb25zdCBQT0xMX0lOVEVSVkFMID0gMTAwMDtcbi8qKlxuICogRGVmYXVsdCBwYXRoIHRvIGpvdXJuYWwgZmlsZXMgZm9yIEVsaXRlLlxuICogQHR5cGUge3N0cmluZ31cbiAqL1xuY29uc3QgREVGQVVMVF9TQVZFX0RJUiA9IHBhdGguam9pbihcblx0b3MuaG9tZWRpcigpLFxuXHQnU2F2ZWQgR2FtZXMnLFxuXHQnRnJvbnRpZXIgRGV2ZWxvcG1lbnRzJyxcblx0J0VsaXRlIERhbmdlcm91cydcbik7XG4vKipcbiAqIEBjbGFzcyBUaGUgbWFpbiBjbGFzcy5cbiAqIEB0dXRvcmlhbCBMb2dXYXRjaGVyLVR1dG9yaWFsXG4gKi9cbmV4cG9ydCBjbGFzcyBMb2dXYXRjaGVyIGV4dGVuZHMgZXZlbnRzLkV2ZW50RW1pdHRlciB7XG5cdC8qKlxuXHQgKiBDb25zdHJ1Y3QgdGhlIGxvZyB3YXRjaGVyLlxuXHQgKiBAcGFyYW0gZGlycGF0aCB7c3RyaW5nfSBUaGUgZGlyZWN0b3J5IHRvIHdhdGNoLlxuXHQgKiBAcGFyYW0gbWF4ZmlsZXMge251bWJlcn0gTWF4aW11bSBhbW91bnQgb2YgZmlsZXMgdG8gcHJvY2Vzcy5cblx0ICogQHBhcmFtIGlnbm9yZUluaXRpYWwge2Jvb2xlYW59IElnbm9yZSBpbml0aWFsIHJlYWQgb3Igbm90LlxuXHQgKi9cblx0Y29uc3RydWN0b3IoZGlycGF0aCwgbWF4ZmlsZXMsIGlnbm9yZUluaXRpYWwpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZGlycGF0aCA9IGRpcnBhdGggfHwgREVGQVVMVF9TQVZFX0RJUjtcblx0XHR0aGlzLl9maWx0ZXIgPSBpc0NvbW1hbmRlckxvZztcblx0XHR0aGlzLl9tYXhmaWxlcyA9IG1heGZpbGVzIHx8IDM7XG5cdFx0dGhpcy5fbG9nRGV0YWlsTWFwID0ge307XG5cdFx0dGhpcy5fb3BzID0gW107XG5cdFx0dGhpcy5fb3AgPSBudWxsO1xuXHRcdHRoaXMuX3N0YXJ0VGltZSA9IG5ldyBEYXRlKCk7XG5cdFx0dGhpcy5fdGltZXIgPSBudWxsO1xuXHRcdHRoaXMuX2RpZSA9IGZhbHNlO1xuXHRcdHRoaXMuX2lnbm9yZUluaXRpYWwgPSBpZ25vcmVJbml0aWFsIHx8IGZhbHNlO1xuXHRcdHRoaXMuc3RvcHBlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2xvb3AoKTtcblx0XHR0aGlzLmVtaXQoJ1N0YXJ0ZWQnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdXJ5IGEgZmlsZVxuXHQgKiBAcGFyYW0gZmlsZW5hbWUge3N0cmluZ30gRmlsZSB0byBidXJ5LlxuXHQgKi9cblx0YnVyeShmaWxlbmFtZSkge1xuXHRcdGRlYnVnKCdidXJ5Jywge2ZpbGVuYW1lfSk7XG5cdFx0dGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXS50b21ic3RvbmVkID0gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdG9wIHJ1bm5pbmdcblx0ICovXG5cdHN0b3AoKSB7XG5cdFx0ZGVidWcoJ3N0b3AnKTtcblxuXHRcdGlmICh0aGlzLl9vcCA9PT0gbnVsbCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3RpbWVyKTtcblx0XHRcdHRoaXMuc3RvcHBlZCA9IHRydWU7XG5cdFx0XHR0aGlzLmVtaXQoJ3N0b3BwZWQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fb3BzLnNwbGljZSh0aGlzLl9vcHMubGVuZ3RoKTtcblx0XHRcdHRoaXMuc3RvcHBlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9kaWUgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbWFpbiBsb29wXG5cdCAqL1xuXHRfbG9vcCgpIHtcblx0XHRkZWJ1ZygnX2xvb3AnLCB7b3Bjb3VudDogdGhpcy5fb3BzLmxlbmd0aH0pO1xuXG5cdFx0dGhpcy5fb3AgPSBudWxsO1xuXG5cdFx0aWYgKHRoaXMuX29wcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX3RpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX29wcy5wdXNoKGNhbGxiYWNrID0+IHRoaXMuX3BvbGwoY2FsbGJhY2spKTtcblx0XHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuX2xvb3AoKSk7XG5cdFx0XHR9LCBQT0xMX0lOVEVSVkFMKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9vcCA9IHRoaXMuX29wcy5zaGlmdCgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX29wKGVyciA9PiB7XG5cdFx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9kaWUpIHtcblx0XHRcdFx0XHR0aGlzLmVtaXQoJ3N0b3BwZWQnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gdGhpcy5fbG9vcCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKTtcblx0XHRcdFx0Ly8gQXNzdW1wdGlvbjogaXQgY3Jhc2hlZCBCRUZPUkUgYW4gYXN5bmMgd2FpdFxuXHRcdFx0XHQvLyBvdGhlcndpc2UsIHdlJ2xsIGVuZCB1cCB3aXRoIG1vcmUgc2ltdWx0YW5lb3VzXG5cdFx0XHRcdC8vIGFjdGl2aXR5XG5cdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gdGhpcy5fbG9vcCgpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUG9sbCB0aGUgbG9ncyBkaXJlY3RvcnkgZm9yIG5ldy91cGRhdGVkIGZpbGVzLlxuXHQgKiBAcGFyYW0gY2FsbGJhY2sge2Z1bmN0aW9ufVxuXHQgKi9cblx0X3BvbGwoY2FsbGJhY2spIHtcblx0XHRkZWJ1ZygnX3BvbGwnKTtcblxuXHRcdGNvbnN0IHVuc2VlbiA9IHt9O1xuXHRcdE9iamVjdC5rZXlzKHRoaXMuX2xvZ0RldGFpbE1hcCkuZm9yRWFjaChmaWxlbmFtZSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0udG9tYnN0b25lZCkge1xuXHRcdFx0XHR1bnNlZW5bZmlsZW5hbWVdID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGZzLnJlYWRkaXIodGhpcy5fZGlycGF0aCwgKGVyciwgZmlsZW5hbWVzKSA9PiB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdGNhbGxiYWNrKGVycik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBmaWxlcyA9IGZpbGVuYW1lcy5zbGljZShmaWxlbmFtZXMubGVuZ3RoIC0gdGhpcy5fbWF4ZmlsZXMsIGZpbGVuYW1lcy5sZW5ndGgpO1xuXHRcdFx0XHRmaWxlcy5mb3JFYWNoKGZpbGVuYW1lID0+IHtcblx0XHRcdFx0XHRmaWxlbmFtZSA9IHBhdGguam9pbih0aGlzLl9kaXJwYXRoLCBmaWxlbmFtZSk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2ZpbHRlcihmaWxlbmFtZSkpIHtcblx0XHRcdFx0XHRcdGRlbGV0ZSB1bnNlZW5bZmlsZW5hbWVdO1xuXHRcdFx0XHRcdFx0dGhpcy5fb3BzLnB1c2goY2IgPT4gdGhpcy5fc3RhdGZpbGUoZmlsZW5hbWUsIGNiKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRPYmplY3Qua2V5cyh1bnNlZW4pLmZvckVhY2goZmlsZW5hbWUgPT4ge1xuXHRcdFx0XHRcdHRoaXMuYnVyeShmaWxlbmFtZSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNhbGxiYWNrKG51bGwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0YXQgdGhlIG5ldy91cGRhdGVkIGZpbGVzIGluIGxvZyBkaXJlY3Rvcnlcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IFBhdGggdG8gZmlsZSB0byBnZXQgc3RhdHMgb2YuXG5cdCAqIEBwYXJhbSBjYWxsYmFja1xuXHQgKi9cblx0X3N0YXRmaWxlKGZpbGVuYW1lLCBjYWxsYmFjaykge1xuXHRcdGRlYnVnKCdfc3RhdGZpbGUnLCB7ZmlsZW5hbWV9KTtcblxuXHRcdGZzLnN0YXQoZmlsZW5hbWUsIChlcnIsIHN0YXRzKSA9PiB7XG5cdFx0XHRpZiAoZXJyICYmIGVyci5jb2RlID09PSAnRU5PRU5UJykge1xuXHRcdFx0XHRpZiAodGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXSkge1xuXHRcdFx0XHRcdHRoaXMuYnVyeShmaWxlbmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FsbGJhY2sobnVsbCk7IC8vIEZpbGUgZGVsZXRlZFxuXHRcdFx0fSBlbHNlIGlmIChlcnIpIHtcblx0XHRcdFx0Y2FsbGJhY2soZXJyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29wcy5wdXNoKGNiID0+IHRoaXMuX3Byb2Nlc3MoZmlsZW5hbWUsIHN0YXRzLCBjYikpO1xuXHRcdFx0XHRjYWxsYmFjayhudWxsKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm9jZXNzIHRoZSBmaWxlc1xuXHQgKiBAcGFyYW0gZmlsZW5hbWUge3N0cmluZ30gRmlsZW5hbWUgdG8gY2hlY2tcblx0ICogQHBhcmFtIHN0YXRzIHtvYmplY3R9IExhc3QgbW9kaWZpZWQgZXRjXG5cdCAqIEBwYXJhbSBjYWxsYmFjayB7ZnVuY3Rpb259XG5cdCAqL1xuXHRfcHJvY2VzcyhmaWxlbmFtZSwgc3RhdHMsIGNhbGxiYWNrKSB7XG5cdFx0ZGVidWcoJ19wcm9jZXNzJywge2ZpbGVuYW1lfSk7XG5cdFx0bGV0IENVUlJFTlRfRklMRSA9IDA7XG5cdFx0c2V0SW1tZWRpYXRlKGNhbGxiYWNrLCBudWxsKTtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXTtcblx0XHRpZiAodGhpcy5faWdub3JlSW5pdGlhbCAmJiBzdGF0cy5tdGltZSA8IHRoaXMuX3N0YXJ0VGltZSkge1xuXHRcdFx0cmV0dXJuXG5cdFx0fVxuXHRcdGlmIChpbmZvID09PSB1bmRlZmluZWQgJiYgQ1VSUkVOVF9GSUxFIDwgdGhpcy5fbWF4ZmlsZXMpIHtcblx0XHRcdHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0gPSB7XG5cdFx0XHRcdGlubzogc3RhdHMuaW5vLFxuXHRcdFx0XHRtdGltZTogc3RhdHMubXRpbWUsXG5cdFx0XHRcdHNpemU6IHN0YXRzLnNpemUsXG5cdFx0XHRcdHdhdGVybWFyazogMCxcblx0XHRcdFx0dG9tYnN0b25lZDogZmFsc2Vcblx0XHRcdH07XG5cdFx0XHRDVVJSRU5UX0ZJTEUrKztcblx0XHRcdHRoaXMuX29wcy5wdXNoKGNiID0+IHRoaXMuX3JlYWQoZmlsZW5hbWUsIGNiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGluZm8udG9tYnN0b25lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpbmZvLmlubyAhPT0gc3RhdHMuaW5vKSB7XG5cdFx0XHRcdC8vIEZpbGUgcmVwbGFjZWQuLi4gY2FuJ3QgdHJ1c3QgaXQgYW55IG1vcmVcblx0XHRcdFx0Ly8gaWYgdGhlIGNsaWVudCBBUEkgc3VwcG9ydGVkIHJlcGxheSBmcm9tIHNjcmF0Y2gsIHdlIGNvdWxkIGRvIHRoYXRcblx0XHRcdFx0Ly8gYnV0IHdlIGNhbid0IHlldCwgc286XG5cdFx0XHRDVVJSRU5UX0ZJTEUgPSAwO1xuXHRcdFx0dGhpcy5idXJ5KGZpbGVuYW1lKTtcblx0XHR9IGVsc2UgaWYgKHN0YXRzLnNpemUgPiBpbmZvLnNpemUpIHtcblx0XHRcdFx0Ly8gRmlsZSBub3QgcmVwbGFjZWQ7IGdvdCBsb25nZXIuLi4gYXNzdW1lIGFwcGVuZFxuXHRcdFx0dGhpcy5fb3BzLnB1c2goY2IgPT4gdGhpcy5fcmVhZChmaWxlbmFtZSwgY2IpKTtcblx0XHR9IGVsc2UgaWYgKGluZm8uaW5vID09PSBzdGF0cy5pbm8gJiYgaW5mby5zaXplID09PSBzdGF0cy5zaXplKSB7XG5cdFx0XHRcdC8vIEV2ZW4gaWYgbXRpbWUgaXMgZGlmZmVyZW50LCB0cmVhdCBpdCBhcyB1bmNoYW5nZWRcblx0XHRcdFx0Ly8gZS5nLiBeWiB3aGVuIENPUFkgQ09OIHRvIGEgZmFrZSBsb2dcblx0XHRcdFx0Ly8gZG9uJ3QgcXVldWUgcmVhZFxuXHRcdH1cblxuXHRcdGluZm8ubXRpbWUgPSBzdGF0cy5tdGltZTtcblx0XHRpbmZvLnNpemUgPSBzdGF0cy5zaXplO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWQgdGhlIGZpbGVzXG5cdCAqIEBwYXJhbSBmaWxlbmFtZSB7c3RyaW5nfSBUaGUgZmlsZW5hbWUgdG8gcmVhZC5cblx0ICogQHBhcmFtIGNhbGxiYWNrIHtmdW5jdGlvbn1cblx0ICovXG5cdF9yZWFkKGZpbGVuYW1lLCBjYWxsYmFjaykge1xuXHRcdGNvbnN0IHt3YXRlcm1hcmssIHNpemV9ID0gdGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXTtcblx0XHRkZWJ1ZygnX3JlYWQnLCB7ZmlsZW5hbWUsIHdhdGVybWFyaywgc2l6ZX0pO1xuXHRcdGxldCBsZWZ0b3ZlciA9IEJ1ZmZlci5mcm9tKCcnLCAndXRmOCcpO1xuXG5cdFx0Y29uc3QgcyA9IGZzLmNyZWF0ZVJlYWRTdHJlYW0oZmlsZW5hbWUsIHtcblx0XHRcdGZsYWdzOiAncicsXG5cdFx0XHRzdGFydDogd2F0ZXJtYXJrLFxuXHRcdFx0ZW5kOiBzaXplXG5cdFx0fSk7XG5cdFx0Y29uc3QgZmluaXNoID0gZXJyID0+IHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHQvLyBPbiBhbnkgZXJyb3IsIGVtaXQgdGhlIGVycm9yIGFuZCBidXJ5IHRoZSBmaWxlLlxuXHRcdFx0XHR0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKTtcblx0XHRcdFx0dGhpcy5idXJ5KGZpbGVuYW1lKTtcblx0XHRcdH1cblx0XHRcdHNldEltbWVkaWF0ZShjYWxsYmFjaywgbnVsbCk7XG5cdFx0XHRjYWxsYmFjayA9ICgpID0+IHtcblx0XHRcdH07IC8vIE5vLW9wXG5cdFx0fTtcblx0XHRzLm9uY2UoJ2Vycm9yJywgZmluaXNoKTtcblxuXHRcdHMub25jZSgnZW5kJywgZmluaXNoKTtcblxuXHRcdHMub24oJ2RhdGEnLCBjaHVuayA9PiB7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IGNodW5rLmxhc3RJbmRleE9mKCdcXG4nKTtcblx0XHRcdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdFx0XHRsZWZ0b3ZlciA9IEJ1ZmZlci5jb25jYXQoW2xlZnRvdmVyLCBjaHVua10pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0ud2F0ZXJtYXJrICs9IGlkeCArIDE7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IG9icyA9IEJ1ZmZlci5jb25jYXQoW2xlZnRvdmVyLCBjaHVuay5zbGljZSgwLCBpZHggKyAxKV0pXG5cdFx0XHRcdFx0XHRcdC50b1N0cmluZygndXRmOCcpXG5cdFx0XHRcdFx0XHRcdC5yZXBsYWNlKC9cXHUwMDBlL2lnbSwgJycpXG5cdFx0XHRcdFx0XHRcdC5yZXBsYWNlKC9cXHUwMDBmL2lnbSwgJycpXG5cdFx0XHRcdFx0XHRcdC5zcGxpdCgvW1xcclxcbl0rLylcblx0XHRcdFx0XHRcdFx0LmZpbHRlcihsID0+IGwubGVuZ3RoID4gMClcblx0XHRcdFx0XHRcdFx0Lm1hcChsID0+IHtcblx0XHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIEpTT04ucGFyc2UobClcblx0XHRcdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRkZWJ1ZygnanNvbi5wYXJzZSBlcnJvcicsIHtsaW5lOiBsfSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGxlZnRvdmVyID0gY2h1bmsuc2xpY2UoaWR4ICsgMSk7XG5cdFx0XHRcdFx0XHRpZiAob2JzKSB7XG5cdFx0XHRcdFx0XHRcdGRlYnVnKCdkYXRhIGVtaXQnKTtcblx0XHRcdFx0XHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuZW1pdCgnZGF0YScsIG9icykgJiYgdGhpcy5lbWl0KCdmaW5pc2hlZCcpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWcoJ2RhdGEgZW1pdCcpO1xuXHRcdFx0XHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gdGhpcy5lbWl0KCdkYXRhJywge30pICYmIHRoaXMuZW1pdCgnZmluaXNoZWQnKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHRmaW5pc2goZXJyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG59XG4vKipcbiAqIEdldCB0aGUgcGF0aCBvZiB0aGUgbG9ncy5cbiAqIEBwYXJhbSBmcGF0aCB7c3RyaW5nfSBQYXRoIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlIGRpcmVjdG9yeSBjb250YWlucyBqb3VybmFsIGZpbGVzLlxuICovXG5mdW5jdGlvbiBpc0NvbW1hbmRlckxvZyhmcGF0aCkge1xuXHRjb25zdCBiYXNlID0gcGF0aC5iYXNlbmFtZShmcGF0aCk7XG5cdHJldHVybiBiYXNlLmluZGV4T2YoJ0pvdXJuYWwuJykgPT09IDAgJiYgcGF0aC5leHRuYW1lKGZwYXRoKSA9PT0gJy5sb2cnO1xufVxuXG5pZiAoIW1vZHVsZS5wYXJlbnQpIHtcblx0cHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCBlcnIgPT4ge1xuXHRcdGNvbnNvbGUuZXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGVyci5zdGFjayB8fCBlcnIpO1xuXHR9KTtcblxuXHRjb25zdCB3YXRjaGVyID0gbmV3IExvZ1dhdGNoZXIoREVGQVVMVF9TQVZFX0RJUiwgMywgdHJ1ZSk7XG5cdHdhdGNoZXIub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHR3YXRjaGVyLnN0b3AoKTtcblx0XHRjb25zb2xlLmVycm9yKGVyci5zdGFjayB8fCBlcnIpO1xuXHRcdHRocm93IG5ldyBFcnJvcihlcnIuc3RhY2sgfHwgZXJyKTtcblx0fSk7XG5cdHdhdGNoZXIub24oJ2RhdGEnLCBvYnMgPT4ge1xuXHRcdG9icy5mb3JFYWNoKG9iID0+IHtcblx0XHRcdGNvbnN0IHt0aW1lc3RhbXAsIGV2ZW50fSA9IG9iO1xuXHRcdFx0Y29uc29sZS5sb2coJ1xcbicgKyB0aW1lc3RhbXAsIGV2ZW50KTtcblx0XHRcdGRlbGV0ZSBvYi50aW1lc3RhbXA7XG5cdFx0XHRkZWxldGUgb2IuZXZlbnQ7XG5cdFx0XHRPYmplY3Qua2V5cyhvYikuc29ydCgpLmZvckVhY2goayA9PiB7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKCdcXHQnICsgaywgb2Jba10pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuIl19
