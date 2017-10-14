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
   */
  function LogWatcher(dirpath, maxfiles) {
    var _this;

    _classCallCheck(this, LogWatcher);

    _this = _possibleConstructorReturn(this, (LogWatcher.__proto__ || Object.getPrototypeOf(LogWatcher)).call(this));
    _this._dirpath = dirpath || DEFAULT_SAVE_DIR;
    _this._filter = isCommanderLog;
    _this._maxfiles = maxfiles || 3;
    _this._logDetailMap = {};
    _this._ops = [];
    _this._op = null;
    _this._timer = null;
    _this._die = false;
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
      Object.keys(ob).sort().forEach(function (k) {// console.log('\t' + k, ob[k]);
      });
    });
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2ctd2F0Y2hlci5qcyJdLCJuYW1lcyI6WyJkZWJ1ZyIsIlBPTExfSU5URVJWQUwiLCJERUZBVUxUX1NBVkVfRElSIiwiam9pbiIsImhvbWVkaXIiLCJMb2dXYXRjaGVyIiwiZGlycGF0aCIsIm1heGZpbGVzIiwiX2RpcnBhdGgiLCJfZmlsdGVyIiwiaXNDb21tYW5kZXJMb2ciLCJfbWF4ZmlsZXMiLCJfbG9nRGV0YWlsTWFwIiwiX29wcyIsIl9vcCIsIl90aW1lciIsIl9kaWUiLCJzdG9wcGVkIiwiX2xvb3AiLCJlbWl0IiwiZmlsZW5hbWUiLCJ0b21ic3RvbmVkIiwiY2xlYXJUaW1lb3V0Iiwic3BsaWNlIiwibGVuZ3RoIiwib3Bjb3VudCIsInNldFRpbWVvdXQiLCJwdXNoIiwiX3BvbGwiLCJjYWxsYmFjayIsInNldEltbWVkaWF0ZSIsInNoaWZ0IiwiZXJyIiwidW5zZWVuIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJyZWFkZGlyIiwiZmlsZW5hbWVzIiwiZmlsZXMiLCJzbGljZSIsIl9zdGF0ZmlsZSIsImNiIiwiYnVyeSIsInN0YXQiLCJzdGF0cyIsImNvZGUiLCJfcHJvY2VzcyIsIkNVUlJFTlRfRklMRSIsImluZm8iLCJ1bmRlZmluZWQiLCJpbm8iLCJtdGltZSIsInNpemUiLCJ3YXRlcm1hcmsiLCJfcmVhZCIsImxlZnRvdmVyIiwiQnVmZmVyIiwiZnJvbSIsInMiLCJjcmVhdGVSZWFkU3RyZWFtIiwiZmxhZ3MiLCJzdGFydCIsImVuZCIsImZpbmlzaCIsIm9uY2UiLCJvbiIsImlkeCIsImNodW5rIiwibGFzdEluZGV4T2YiLCJjb25jYXQiLCJvYnMiLCJ0b1N0cmluZyIsInJlcGxhY2UiLCJzcGxpdCIsImZpbHRlciIsImwiLCJtYXAiLCJKU09OIiwicGFyc2UiLCJlIiwibGluZSIsIkV2ZW50RW1pdHRlciIsImZwYXRoIiwiYmFzZSIsImJhc2VuYW1lIiwiaW5kZXhPZiIsImV4dG5hbWUiLCJtb2R1bGUiLCJwYXJlbnQiLCJwcm9jZXNzIiwiY29uc29sZSIsImVycm9yIiwic3RhY2siLCJFcnJvciIsIndhdGNoZXIiLCJzdG9wIiwidGltZXN0YW1wIiwib2IiLCJldmVudCIsImxvZyIsInNvcnQiXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7QUFLQTs7O0FBR0E7Ozs7Ozs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7OztBQUVBLElBQU1BLFFBQVEsb0JBQU8sZUFBUCxDQUFkO0FBR0E7Ozs7O0FBSUEsSUFBTUMsZ0JBQWdCLElBQXRCO0FBQ0E7Ozs7O0FBSUEsSUFBTUMsbUJBQW1CLGNBQUtDLElBQUwsQ0FDeEIsWUFBR0MsT0FBSCxFQUR3QixFQUV4QixhQUZ3QixFQUd4Qix1QkFId0IsRUFJeEIsaUJBSndCLENBQXpCO0FBTUE7Ozs7OztJQUlhQyxVOzs7OztBQUNaOzs7OztBQUtBLHNCQUFZQyxPQUFaLEVBQXFCQyxRQUFyQixFQUErQjtBQUFBOztBQUFBOztBQUM5QjtBQUVBLFVBQUtDLFFBQUwsR0FBZ0JGLFdBQVdKLGdCQUEzQjtBQUNBLFVBQUtPLE9BQUwsR0FBZUMsY0FBZjtBQUNBLFVBQUtDLFNBQUwsR0FBaUJKLFlBQVksQ0FBN0I7QUFDQSxVQUFLSyxhQUFMLEdBQXFCLEVBQXJCO0FBQ0EsVUFBS0MsSUFBTCxHQUFZLEVBQVo7QUFDQSxVQUFLQyxHQUFMLEdBQVcsSUFBWDtBQUNBLFVBQUtDLE1BQUwsR0FBYyxJQUFkO0FBQ0EsVUFBS0MsSUFBTCxHQUFZLEtBQVo7QUFDQSxVQUFLQyxPQUFMLEdBQWUsS0FBZjs7QUFDQSxVQUFLQyxLQUFMOztBQUNBLFVBQUtDLElBQUwsQ0FBVSxTQUFWOztBQWI4QjtBQWM5QjtBQUVEOzs7Ozs7Ozt5QkFJS0MsUSxFQUFVO0FBQ2RwQixZQUFNLE1BQU4sRUFBYztBQUFDb0I7QUFBRCxPQUFkO0FBQ0EsV0FBS1IsYUFBTCxDQUFtQlEsUUFBbkIsRUFBNkJDLFVBQTdCLEdBQTBDLElBQTFDO0FBQ0E7QUFFRDs7Ozs7OzJCQUdPO0FBQ05yQixZ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KiBAZmlsZSBUaGUgZmlsZSB0aGF0IGRvZXMgdGhlIHdhdGNoZXIgcHJvY2Vzc2luZy5cbiAqIEBhdXRob3Igd2lsbHliMzIxXG4gKiBAY29weXJpZ2h0IE1JVFxuICovXG4vKipcbiAqIEBtb2R1bGUgV2F0Y2hlclxuICovXG4ndXNlIHN0cmljdCc7XG5pbXBvcnQgZXZlbnRzIGZyb20gJ2V2ZW50cyc7XG5pbXBvcnQgb3MgZnJvbSAnb3MnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IGRlYnVnMCBmcm9tICdkZWJ1Zyc7XG5cbmNvbnN0IGRlYnVnID0gZGVidWcwKCdlZC1sb2d3YXRjaGVyJyk7XG5cblxuLyoqXG4gKiBJbnRlcnZhbCBpbiBNUyB0byBwb2xsIGRpcmVjdG9yeSBhdC5cbiAqIEB0eXBlIHtudW1iZXJ9XG4gKi9cbmNvbnN0IFBPTExfSU5URVJWQUwgPSAxMDAwO1xuLyoqXG4gKiBEZWZhdWx0IHBhdGggdG8gam91cm5hbCBmaWxlcyBmb3IgRWxpdGUuXG4gKiBAdHlwZSB7c3RyaW5nfVxuICovXG5jb25zdCBERUZBVUxUX1NBVkVfRElSID0gcGF0aC5qb2luKFxuXHRvcy5ob21lZGlyKCksXG5cdCdTYXZlZCBHYW1lcycsXG5cdCdGcm9udGllciBEZXZlbG9wbWVudHMnLFxuXHQnRWxpdGUgRGFuZ2Vyb3VzJ1xuKTtcbi8qKlxuICogQGNsYXNzIFRoZSBtYWluIGNsYXNzLlxuICogQHR1dG9yaWFsIExvZ1dhdGNoZXItVHV0b3JpYWxcbiAqL1xuZXhwb3J0IGNsYXNzIExvZ1dhdGNoZXIgZXh0ZW5kcyBldmVudHMuRXZlbnRFbWl0dGVyIHtcblx0LyoqXG5cdCAqIENvbnN0cnVjdCB0aGUgbG9nIHdhdGNoZXIuXG5cdCAqIEBwYXJhbSBkaXJwYXRoIHtzdHJpbmd9IFRoZSBkaXJlY3RvcnkgdG8gd2F0Y2guXG5cdCAqIEBwYXJhbSBtYXhmaWxlcyB7bnVtYmVyfSBNYXhpbXVtIGFtb3VudCBvZiBmaWxlcyB0byBwcm9jZXNzLlxuXHQgKi9cblx0Y29uc3RydWN0b3IoZGlycGF0aCwgbWF4ZmlsZXMpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZGlycGF0aCA9IGRpcnBhdGggfHwgREVGQVVMVF9TQVZFX0RJUjtcblx0XHR0aGlzLl9maWx0ZXIgPSBpc0NvbW1hbmRlckxvZztcblx0XHR0aGlzLl9tYXhmaWxlcyA9IG1heGZpbGVzIHx8IDM7XG5cdFx0dGhpcy5fbG9nRGV0YWlsTWFwID0ge307XG5cdFx0dGhpcy5fb3BzID0gW107XG5cdFx0dGhpcy5fb3AgPSBudWxsO1xuXHRcdHRoaXMuX3RpbWVyID0gbnVsbDtcblx0XHR0aGlzLl9kaWUgPSBmYWxzZTtcblx0XHR0aGlzLnN0b3BwZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9sb29wKCk7XG5cdFx0dGhpcy5lbWl0KCdTdGFydGVkJyk7XG5cdH1cblxuXHQvKipcblx0ICogQnVyeSBhIGZpbGVcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IEZpbGUgdG8gYnVyeS5cblx0ICovXG5cdGJ1cnkoZmlsZW5hbWUpIHtcblx0XHRkZWJ1ZygnYnVyeScsIHtmaWxlbmFtZX0pO1xuXHRcdHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0udG9tYnN0b25lZCA9IHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogU3RvcCBydW5uaW5nXG5cdCAqL1xuXHRzdG9wKCkge1xuXHRcdGRlYnVnKCdzdG9wJyk7XG5cblx0XHRpZiAodGhpcy5fb3AgPT09IG51bGwpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl90aW1lcik7XG5cdFx0XHR0aGlzLnN0b3BwZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5lbWl0KCdzdG9wcGVkJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX29wcy5zcGxpY2UodGhpcy5fb3BzLmxlbmd0aCk7XG5cdFx0XHR0aGlzLnN0b3BwZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fZGllID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVGhlIG1haW4gbG9vcFxuXHQgKi9cblx0X2xvb3AoKSB7XG5cdFx0ZGVidWcoJ19sb29wJywge29wY291bnQ6IHRoaXMuX29wcy5sZW5ndGh9KTtcblxuXHRcdHRoaXMuX29wID0gbnVsbDtcblxuXHRcdGlmICh0aGlzLl9vcHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl90aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vcHMucHVzaChjYWxsYmFjayA9PiB0aGlzLl9wb2xsKGNhbGxiYWNrKSk7XG5cdFx0XHRcdHNldEltbWVkaWF0ZSgoKSA9PiB0aGlzLl9sb29wKCkpO1xuXHRcdFx0fSwgUE9MTF9JTlRFUlZBTCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fb3AgPSB0aGlzLl9vcHMuc2hpZnQoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9vcChlcnIgPT4ge1xuXHRcdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5lbWl0KCdlcnJvcicsIGVycik7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fZGllKSB7XG5cdFx0XHRcdFx0dGhpcy5lbWl0KCdzdG9wcGVkJyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuX2xvb3AoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5lbWl0KCdlcnJvcicsIGVycik7XG5cdFx0XHRcdC8vIEFzc3VtcHRpb246IGl0IGNyYXNoZWQgQkVGT1JFIGFuIGFzeW5jIHdhaXRcblx0XHRcdFx0Ly8gb3RoZXJ3aXNlLCB3ZSdsbCBlbmQgdXAgd2l0aCBtb3JlIHNpbXVsdGFuZW91c1xuXHRcdFx0XHQvLyBhY3Rpdml0eVxuXHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuX2xvb3AoKSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFBvbGwgdGhlIGxvZ3MgZGlyZWN0b3J5IGZvciBuZXcvdXBkYXRlZCBmaWxlcy5cblx0ICogQHBhcmFtIGNhbGxiYWNrIHtmdW5jdGlvbn1cblx0ICovXG5cdF9wb2xsKGNhbGxiYWNrKSB7XG5cdFx0ZGVidWcoJ19wb2xsJyk7XG5cblx0XHRjb25zdCB1bnNlZW4gPSB7fTtcblx0XHRPYmplY3Qua2V5cyh0aGlzLl9sb2dEZXRhaWxNYXApLmZvckVhY2goZmlsZW5hbWUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdLnRvbWJzdG9uZWQpIHtcblx0XHRcdFx0dW5zZWVuW2ZpbGVuYW1lXSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRmcy5yZWFkZGlyKHRoaXMuX2RpcnBhdGgsIChlcnIsIGZpbGVuYW1lcykgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRjYWxsYmFjayhlcnIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZmlsZXMgPSBmaWxlbmFtZXMuc2xpY2UoZmlsZW5hbWVzLmxlbmd0aCAtIHRoaXMuX21heGZpbGVzLCBmaWxlbmFtZXMubGVuZ3RoKTtcblx0XHRcdFx0ZmlsZXMuZm9yRWFjaChmaWxlbmFtZSA9PiB7XG5cdFx0XHRcdFx0ZmlsZW5hbWUgPSBwYXRoLmpvaW4odGhpcy5fZGlycGF0aCwgZmlsZW5hbWUpO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9maWx0ZXIoZmlsZW5hbWUpKSB7XG5cdFx0XHRcdFx0XHRkZWxldGUgdW5zZWVuW2ZpbGVuYW1lXTtcblx0XHRcdFx0XHRcdHRoaXMuX29wcy5wdXNoKGNiID0+IHRoaXMuX3N0YXRmaWxlKGZpbGVuYW1lLCBjYikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0T2JqZWN0LmtleXModW5zZWVuKS5mb3JFYWNoKGZpbGVuYW1lID0+IHtcblx0XHRcdFx0XHR0aGlzLmJ1cnkoZmlsZW5hbWUpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjYWxsYmFjayhudWxsKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdGF0IHRoZSBuZXcvdXBkYXRlZCBmaWxlcyBpbiBsb2cgZGlyZWN0b3J5XG5cdCAqIEBwYXJhbSBmaWxlbmFtZSB7c3RyaW5nfSBQYXRoIHRvIGZpbGUgdG8gZ2V0IHN0YXRzIG9mLlxuXHQgKiBAcGFyYW0gY2FsbGJhY2tcblx0ICovXG5cdF9zdGF0ZmlsZShmaWxlbmFtZSwgY2FsbGJhY2spIHtcblx0XHRkZWJ1ZygnX3N0YXRmaWxlJywge2ZpbGVuYW1lfSk7XG5cblx0XHRmcy5zdGF0KGZpbGVuYW1lLCAoZXJyLCBzdGF0cykgPT4ge1xuXHRcdFx0aWYgKGVyciAmJiBlcnIuY29kZSA9PT0gJ0VOT0VOVCcpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0pIHtcblx0XHRcdFx0XHR0aGlzLmJ1cnkoZmlsZW5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwpOyAvLyBGaWxlIGRlbGV0ZWRcblx0XHRcdH0gZWxzZSBpZiAoZXJyKSB7XG5cdFx0XHRcdGNhbGxiYWNrKGVycik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9vcHMucHVzaChjYiA9PiB0aGlzLl9wcm9jZXNzKGZpbGVuYW1lLCBzdGF0cywgY2IpKTtcblx0XHRcdFx0Y2FsbGJhY2sobnVsbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUHJvY2VzcyB0aGUgZmlsZXNcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IEZpbGVuYW1lIHRvIGNoZWNrXG5cdCAqIEBwYXJhbSBzdGF0cyB7b2JqZWN0fSBMYXN0IG1vZGlmaWVkIGV0Y1xuXHQgKiBAcGFyYW0gY2FsbGJhY2sge2Z1bmN0aW9ufVxuXHQgKi9cblx0X3Byb2Nlc3MoZmlsZW5hbWUsIHN0YXRzLCBjYWxsYmFjaykge1xuXHRcdGRlYnVnKCdfcHJvY2VzcycsIHtmaWxlbmFtZX0pO1xuXHRcdGxldCBDVVJSRU5UX0ZJTEUgPSAwO1xuXHRcdHNldEltbWVkaWF0ZShjYWxsYmFjaywgbnVsbCk7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV07XG5cblx0XHRpZiAoaW5mbyA9PT0gdW5kZWZpbmVkICYmIENVUlJFTlRfRklMRSA8IHRoaXMuX21heGZpbGVzKSB7XG5cdFx0XHR0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdID0ge1xuXHRcdFx0XHRpbm86IHN0YXRzLmlubyxcblx0XHRcdFx0bXRpbWU6IHN0YXRzLm10aW1lLFxuXHRcdFx0XHRzaXplOiBzdGF0cy5zaXplLFxuXHRcdFx0XHR3YXRlcm1hcms6IDAsXG5cdFx0XHRcdHRvbWJzdG9uZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0Q1VSUkVOVF9GSUxFKys7XG5cdFx0XHR0aGlzLl9vcHMucHVzaChjYiA9PiB0aGlzLl9yZWFkKGZpbGVuYW1lLCBjYikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpbmZvLnRvbWJzdG9uZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaW5mby5pbm8gIT09IHN0YXRzLmlubykge1xuXHRcdFx0XHQvLyBGaWxlIHJlcGxhY2VkLi4uIGNhbid0IHRydXN0IGl0IGFueSBtb3JlXG5cdFx0XHRcdC8vIGlmIHRoZSBjbGllbnQgQVBJIHN1cHBvcnRlZCByZXBsYXkgZnJvbSBzY3JhdGNoLCB3ZSBjb3VsZCBkbyB0aGF0XG5cdFx0XHRcdC8vIGJ1dCB3ZSBjYW4ndCB5ZXQsIHNvOlxuXHRcdFx0Q1VSUkVOVF9GSUxFID0gMDtcblx0XHRcdHRoaXMuYnVyeShmaWxlbmFtZSk7XG5cdFx0fSBlbHNlIGlmIChzdGF0cy5zaXplID4gaW5mby5zaXplKSB7XG5cdFx0XHRcdC8vIEZpbGUgbm90IHJlcGxhY2VkOyBnb3QgbG9uZ2VyLi4uIGFzc3VtZSBhcHBlbmRcblx0XHRcdHRoaXMuX29wcy5wdXNoKGNiID0+IHRoaXMuX3JlYWQoZmlsZW5hbWUsIGNiKSk7XG5cdFx0fSBlbHNlIGlmIChpbmZvLmlubyA9PT0gc3RhdHMuaW5vICYmIGluZm8uc2l6ZSA9PT0gc3RhdHMuc2l6ZSkge1xuXHRcdFx0XHQvLyBFdmVuIGlmIG10aW1lIGlzIGRpZmZlcmVudCwgdHJlYXQgaXQgYXMgdW5jaGFuZ2VkXG5cdFx0XHRcdC8vIGUuZy4gXlogd2hlbiBDT1BZIENPTiB0byBhIGZha2UgbG9nXG5cdFx0XHRcdC8vIGRvbid0IHF1ZXVlIHJlYWRcblx0XHR9XG5cblx0XHRpbmZvLm10aW1lID0gc3RhdHMubXRpbWU7XG5cdFx0aW5mby5zaXplID0gc3RhdHMuc2l6ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkIHRoZSBmaWxlc1xuXHQgKiBAcGFyYW0gZmlsZW5hbWUge3N0cmluZ30gVGhlIGZpbGVuYW1lIHRvIHJlYWQuXG5cdCAqIEBwYXJhbSBjYWxsYmFjayB7ZnVuY3Rpb259XG5cdCAqL1xuXHRfcmVhZChmaWxlbmFtZSwgY2FsbGJhY2spIHtcblx0XHRjb25zdCB7d2F0ZXJtYXJrLCBzaXplfSA9IHRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV07XG5cdFx0ZGVidWcoJ19yZWFkJywge2ZpbGVuYW1lLCB3YXRlcm1hcmssIHNpemV9KTtcblx0XHRsZXQgbGVmdG92ZXIgPSBCdWZmZXIuZnJvbSgnJywgJ3V0ZjgnKTtcblxuXHRcdGNvbnN0IHMgPSBmcy5jcmVhdGVSZWFkU3RyZWFtKGZpbGVuYW1lLCB7XG5cdFx0XHRmbGFnczogJ3InLFxuXHRcdFx0c3RhcnQ6IHdhdGVybWFyayxcblx0XHRcdGVuZDogc2l6ZVxuXHRcdH0pO1xuXHRcdGNvbnN0IGZpbmlzaCA9IGVyciA9PiB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdFx0Ly8gT24gYW55IGVycm9yLCBlbWl0IHRoZSBlcnJvciBhbmQgYnVyeSB0aGUgZmlsZS5cblx0XHRcdFx0dGhpcy5lbWl0KCdlcnJvcicsIGVycik7XG5cdFx0XHRcdHRoaXMuYnVyeShmaWxlbmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRzZXRJbW1lZGlhdGUoY2FsbGJhY2ssIG51bGwpO1xuXHRcdFx0Y2FsbGJhY2sgPSAoKSA9PiB7XG5cdFx0XHR9OyAvLyBOby1vcFxuXHRcdH07XG5cdFx0cy5vbmNlKCdlcnJvcicsIGZpbmlzaCk7XG5cblx0XHRzLm9uY2UoJ2VuZCcsIGZpbmlzaCk7XG5cblx0XHRzLm9uKCdkYXRhJywgY2h1bmsgPT4ge1xuXHRcdFx0XHRjb25zdCBpZHggPSBjaHVuay5sYXN0SW5kZXhPZignXFxuJyk7XG5cdFx0XHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRcdFx0bGVmdG92ZXIgPSBCdWZmZXIuY29uY2F0KFtsZWZ0b3ZlciwgY2h1bmtdKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdLndhdGVybWFyayArPSBpZHggKyAxO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvYnMgPSBCdWZmZXIuY29uY2F0KFtsZWZ0b3ZlciwgY2h1bmsuc2xpY2UoMCwgaWR4ICsgMSldKVxuXHRcdFx0XHRcdFx0XHQudG9TdHJpbmcoJ3V0ZjgnKVxuXHRcdFx0XHRcdFx0XHQucmVwbGFjZSgvXFx1MDAwZS9pZ20sICcnKVxuXHRcdFx0XHRcdFx0XHQucmVwbGFjZSgvXFx1MDAwZi9pZ20sICcnKVxuXHRcdFx0XHRcdFx0XHQuc3BsaXQoL1tcXHJcXG5dKy8pXG5cdFx0XHRcdFx0XHRcdC5maWx0ZXIobCA9PiBsLmxlbmd0aCA+IDApXG5cdFx0XHRcdFx0XHRcdC5tYXAobCA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKGwpXG5cdFx0XHRcdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZGVidWcoJ2pzb24ucGFyc2UgZXJyb3InLCB7bGluZTogbH0pO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRsZWZ0b3ZlciA9IGNodW5rLnNsaWNlKGlkeCArIDEpO1xuXHRcdFx0XHRcdFx0aWYgKG9icykge1xuXHRcdFx0XHRcdFx0XHRkZWJ1ZygnZGF0YSBlbWl0Jyk7XG5cdFx0XHRcdFx0XHRcdHNldEltbWVkaWF0ZSgoKSA9PiB0aGlzLmVtaXQoJ2RhdGEnLCBvYnMpICYmIHRoaXMuZW1pdCgnZmluaXNoZWQnKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnKCdkYXRhIGVtaXQnKTtcblx0XHRcdFx0XHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuZW1pdCgnZGF0YScsIHt9KSAmJiB0aGlzLmVtaXQoJ2ZpbmlzaGVkJykpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0ZmluaXNoKGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxufVxuLyoqXG4gKiBHZXQgdGhlIHBhdGggb2YgdGhlIGxvZ3MuXG4gKiBAcGFyYW0gZnBhdGgge3N0cmluZ30gUGF0aCB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSBkaXJlY3RvcnkgY29udGFpbnMgam91cm5hbCBmaWxlcy5cbiAqL1xuZnVuY3Rpb24gaXNDb21tYW5kZXJMb2coZnBhdGgpIHtcblx0Y29uc3QgYmFzZSA9IHBhdGguYmFzZW5hbWUoZnBhdGgpO1xuXHRyZXR1cm4gYmFzZS5pbmRleE9mKCdKb3VybmFsLicpID09PSAwICYmIHBhdGguZXh0bmFtZShmcGF0aCkgPT09ICcubG9nJztcbn1cblxuaWYgKCFtb2R1bGUucGFyZW50KSB7XG5cdHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgZXJyID0+IHtcblx0XHRjb25zb2xlLmVycm9yKGVyci5zdGFjayB8fCBlcnIpO1xuXHRcdHRocm93IG5ldyBFcnJvcihlcnIuc3RhY2sgfHwgZXJyKTtcblx0fSk7XG5cblx0Y29uc3Qgd2F0Y2hlciA9IG5ldyBMb2dXYXRjaGVyKERFRkFVTFRfU0FWRV9ESVIsIDMpO1xuXHR3YXRjaGVyLm9uKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0d2F0Y2hlci5zdG9wKCk7XG5cdFx0Y29uc29sZS5lcnJvcihlcnIuc3RhY2sgfHwgZXJyKTtcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XG5cdH0pO1xuXHR3YXRjaGVyLm9uKCdkYXRhJywgb2JzID0+IHtcblx0XHRvYnMuZm9yRWFjaChvYiA9PiB7XG5cdFx0XHRjb25zdCB7dGltZXN0YW1wLCBldmVudH0gPSBvYjtcblx0XHRcdGNvbnNvbGUubG9nKCdcXG4nICsgdGltZXN0YW1wLCBldmVudCk7XG5cdFx0XHRkZWxldGUgb2IudGltZXN0YW1wO1xuXHRcdFx0ZGVsZXRlIG9iLmV2ZW50O1xuXHRcdFx0T2JqZWN0LmtleXMob2IpLnNvcnQoKS5mb3JFYWNoKGsgPT4ge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnXFx0JyArIGssIG9iW2tdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn1cbiJdfQ==
