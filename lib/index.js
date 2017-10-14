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
      Object.keys(ob).sort.sort().forEach(function (k) {// console.log('\t' + k, ob[k]);
      });
    });
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2ctd2F0Y2hlci5qcyJdLCJuYW1lcyI6WyJkZWJ1ZyIsIlBPTExfSU5URVJWQUwiLCJERUZBVUxUX1NBVkVfRElSIiwiam9pbiIsImhvbWVkaXIiLCJMb2dXYXRjaGVyIiwiZGlycGF0aCIsIm1heGZpbGVzIiwiX2RpcnBhdGgiLCJfZmlsdGVyIiwiaXNDb21tYW5kZXJMb2ciLCJfbWF4ZmlsZXMiLCJfbG9nRGV0YWlsTWFwIiwiX29wcyIsIl9vcCIsIl90aW1lciIsIl9kaWUiLCJzdG9wcGVkIiwiX2xvb3AiLCJlbWl0IiwiZmlsZW5hbWUiLCJ0b21ic3RvbmVkIiwiY2xlYXJUaW1lb3V0Iiwic3BsaWNlIiwibGVuZ3RoIiwib3Bjb3VudCIsInNldFRpbWVvdXQiLCJwdXNoIiwiX3BvbGwiLCJjYWxsYmFjayIsInNldEltbWVkaWF0ZSIsInNoaWZ0IiwiZXJyIiwidW5zZWVuIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJyZWFkZGlyIiwiZmlsZW5hbWVzIiwiZmlsZXMiLCJzbGljZSIsIl9zdGF0ZmlsZSIsImNiIiwiYnVyeSIsInN0YXQiLCJzdGF0cyIsImNvZGUiLCJfcHJvY2VzcyIsIkNVUlJFTlRfRklMRSIsImluZm8iLCJ1bmRlZmluZWQiLCJpbm8iLCJtdGltZSIsInNpemUiLCJ3YXRlcm1hcmsiLCJfcmVhZCIsImxlZnRvdmVyIiwiQnVmZmVyIiwiZnJvbSIsInMiLCJjcmVhdGVSZWFkU3RyZWFtIiwiZmxhZ3MiLCJzdGFydCIsImVuZCIsImZpbmlzaCIsIm9uY2UiLCJvbiIsImlkeCIsImNodW5rIiwibGFzdEluZGV4T2YiLCJjb25jYXQiLCJvYnMiLCJ0b1N0cmluZyIsInJlcGxhY2UiLCJzcGxpdCIsImZpbHRlciIsImwiLCJtYXAiLCJKU09OIiwicGFyc2UiLCJlIiwibGluZSIsIkV2ZW50RW1pdHRlciIsImZwYXRoIiwiYmFzZSIsImJhc2VuYW1lIiwiaW5kZXhPZiIsImV4dG5hbWUiLCJtb2R1bGUiLCJwYXJlbnQiLCJwcm9jZXNzIiwiY29uc29sZSIsImVycm9yIiwic3RhY2siLCJFcnJvciIsIndhdGNoZXIiLCJzdG9wIiwidGltZXN0YW1wIiwib2IiLCJldmVudCIsImxvZyIsInNvcnQiXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7QUFLQTs7O0FBR0E7Ozs7Ozs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7OztBQUVBLElBQU1BLFFBQVEsb0JBQU8sZUFBUCxDQUFkO0FBR0E7Ozs7O0FBSUEsSUFBTUMsZ0JBQWdCLElBQXRCO0FBQ0E7Ozs7O0FBSUEsSUFBTUMsbUJBQW1CLGNBQUtDLElBQUwsQ0FDeEIsWUFBR0MsT0FBSCxFQUR3QixFQUV4QixhQUZ3QixFQUd4Qix1QkFId0IsRUFJeEIsaUJBSndCLENBQXpCO0FBTUE7Ozs7OztJQUlhQyxVOzs7OztBQUNaOzs7OztBQUtBLHNCQUFZQyxPQUFaLEVBQXFCQyxRQUFyQixFQUErQjtBQUFBOztBQUFBOztBQUM5QjtBQUVBLFVBQUtDLFFBQUwsR0FBZ0JGLFdBQVdKLGdCQUEzQjtBQUNBLFVBQUtPLE9BQUwsR0FBZUMsY0FBZjtBQUNBLFVBQUtDLFNBQUwsR0FBaUJKLFlBQVksQ0FBN0I7QUFDQSxVQUFLSyxhQUFMLEdBQXFCLEVBQXJCO0FBQ0EsVUFBS0MsSUFBTCxHQUFZLEVBQVo7QUFDQSxVQUFLQyxHQUFMLEdBQVcsSUFBWDtBQUNBLFVBQUtDLE1BQUwsR0FBYyxJQUFkO0FBQ0EsVUFBS0MsSUFBTCxHQUFZLEtBQVo7QUFDQSxVQUFLQyxPQUFMLEdBQWUsS0FBZjs7QUFDQSxVQUFLQyxLQUFMOztBQUNBLFVBQUtDLElBQUwsQ0FBVSxTQUFWOztBQWI4QjtBQWM5QjtBQUVEOzs7Ozs7Ozt5QkFJS0MsUSxFQUFVO0FBQ2RwQixZQUFNLE1BQU4sRUFBYztBQUFDb0I7QUFBRCxPQUFkO0FBQ0EsV0FBS1IsYUFBTCxDQUFtQlEsUUFBbkIsRUFBNkJDLFVBQTdCLEdBQTBDLElBQTFDO0FBQ0E7QUFFRDs7Ozs7OzJCQUdPO0FBQ05yQixZ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ZW50IjpbIi8qKlxuICogQGZpbGUgVGhlIGZpbGUgdGhhdCBkb2VzIHRoZSB3YXRjaGVyIHByb2Nlc3NpbmcuXG4gKiBAYXV0aG9yIHdpbGx5YjMyMVxuICogQGNvcHlyaWdodCBNSVRcbiAqL1xuLyoqXG4gKiBAbW9kdWxlIFdhdGNoZXJcbiAqL1xuJ3VzZSBzdHJpY3QnO1xuaW1wb3J0IGV2ZW50cyBmcm9tICdldmVudHMnO1xuaW1wb3J0IG9zIGZyb20gJ29zJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBkZWJ1ZzAgZnJvbSAnZGVidWcnO1xuXG5jb25zdCBkZWJ1ZyA9IGRlYnVnMCgnZWQtbG9nd2F0Y2hlcicpO1xuXG5cbi8qKlxuICogSW50ZXJ2YWwgaW4gTVMgdG8gcG9sbCBkaXJlY3RvcnkgYXQuXG4gKiBAdHlwZSB7bnVtYmVyfVxuICovXG5jb25zdCBQT0xMX0lOVEVSVkFMID0gMTAwMDtcbi8qKlxuICogRGVmYXVsdCBwYXRoIHRvIGpvdXJuYWwgZmlsZXMgZm9yIEVsaXRlLlxuICogQHR5cGUge3N0cmluZ31cbiAqL1xuY29uc3QgREVGQVVMVF9TQVZFX0RJUiA9IHBhdGguam9pbihcblx0b3MuaG9tZWRpcigpLFxuXHQnU2F2ZWQgR2FtZXMnLFxuXHQnRnJvbnRpZXIgRGV2ZWxvcG1lbnRzJyxcblx0J0VsaXRlIERhbmdlcm91cydcbik7XG4vKipcbiAqIEBjbGFzcyBUaGUgbWFpbiBjbGFzcy5cbiAqIEB0dXRvcmlhbCBMb2dXYXRjaGVyLVR1dG9yaWFsXG4gKi9cbmV4cG9ydCBjbGFzcyBMb2dXYXRjaGVyIGV4dGVuZHMgZXZlbnRzLkV2ZW50RW1pdHRlciB7XG5cdC8qKlxuXHQgKiBDb25zdHJ1Y3QgdGhlIGxvZyB3YXRjaGVyLlxuXHQgKiBAcGFyYW0gZGlycGF0aCB7c3RyaW5nfSBUaGUgZGlyZWN0b3J5IHRvIHdhdGNoLlxuXHQgKiBAcGFyYW0gbWF4ZmlsZXMge251bWJlcn0gTWF4aW11bSBhbW91bnQgb2YgZmlsZXMgdG8gcHJvY2Vzcy5cblx0ICovXG5cdGNvbnN0cnVjdG9yKGRpcnBhdGgsIG1heGZpbGVzKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2RpcnBhdGggPSBkaXJwYXRoIHx8IERFRkFVTFRfU0FWRV9ESVI7XG5cdFx0dGhpcy5fZmlsdGVyID0gaXNDb21tYW5kZXJMb2c7XG5cdFx0dGhpcy5fbWF4ZmlsZXMgPSBtYXhmaWxlcyB8fCAzO1xuXHRcdHRoaXMuX2xvZ0RldGFpbE1hcCA9IHt9O1xuXHRcdHRoaXMuX29wcyA9IFtdO1xuXHRcdHRoaXMuX29wID0gbnVsbDtcblx0XHR0aGlzLl90aW1lciA9IG51bGw7XG5cdFx0dGhpcy5fZGllID0gZmFsc2U7XG5cdFx0dGhpcy5zdG9wcGVkID0gZmFsc2U7XG5cdFx0dGhpcy5fbG9vcCgpO1xuXHRcdHRoaXMuZW1pdCgnU3RhcnRlZCcpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1cnkgYSBmaWxlXG5cdCAqIEBwYXJhbSBmaWxlbmFtZSB7c3RyaW5nfSBGaWxlIHRvIGJ1cnkuXG5cdCAqL1xuXHRidXJ5KGZpbGVuYW1lKSB7XG5cdFx0ZGVidWcoJ2J1cnknLCB7ZmlsZW5hbWV9KTtcblx0XHR0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdLnRvbWJzdG9uZWQgPSB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0b3AgcnVubmluZ1xuXHQgKi9cblx0c3RvcCgpIHtcblx0XHRkZWJ1Zygnc3RvcCcpO1xuXG5cdFx0aWYgKHRoaXMuX29wID09PSBudWxsKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fdGltZXIpO1xuXHRcdFx0dGhpcy5zdG9wcGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuZW1pdCgnc3RvcHBlZCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vcHMuc3BsaWNlKHRoaXMuX29wcy5sZW5ndGgpO1xuXHRcdFx0dGhpcy5zdG9wcGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2RpZSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBtYWluIGxvb3Bcblx0ICovXG5cdF9sb29wKCkge1xuXHRcdGRlYnVnKCdfbG9vcCcsIHtvcGNvdW50OiB0aGlzLl9vcHMubGVuZ3RofSk7XG5cblx0XHR0aGlzLl9vcCA9IG51bGw7XG5cblx0XHRpZiAodGhpcy5fb3BzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fb3BzLnB1c2goY2FsbGJhY2sgPT4gdGhpcy5fcG9sbChjYWxsYmFjaykpO1xuXHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gdGhpcy5fbG9vcCgpKTtcblx0XHRcdH0sIFBPTExfSU5URVJWQUwpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX29wID0gdGhpcy5fb3BzLnNoaWZ0KCk7XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fb3AoZXJyID0+IHtcblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2RpZSkge1xuXHRcdFx0XHRcdHRoaXMuZW1pdCgnc3RvcHBlZCcpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNldEltbWVkaWF0ZSgoKSA9PiB0aGlzLl9sb29wKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xuXHRcdFx0XHQvLyBBc3N1bXB0aW9uOiBpdCBjcmFzaGVkIEJFRk9SRSBhbiBhc3luYyB3YWl0XG5cdFx0XHRcdC8vIG90aGVyd2lzZSwgd2UnbGwgZW5kIHVwIHdpdGggbW9yZSBzaW11bHRhbmVvdXNcblx0XHRcdFx0Ly8gYWN0aXZpdHlcblx0XHRcdHNldEltbWVkaWF0ZSgoKSA9PiB0aGlzLl9sb29wKCkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQb2xsIHRoZSBsb2dzIGRpcmVjdG9yeSBmb3IgbmV3L3VwZGF0ZWQgZmlsZXMuXG5cdCAqIEBwYXJhbSBjYWxsYmFjayB7ZnVuY3Rpb259XG5cdCAqL1xuXHRfcG9sbChjYWxsYmFjaykge1xuXHRcdGRlYnVnKCdfcG9sbCcpO1xuXG5cdFx0Y29uc3QgdW5zZWVuID0ge307XG5cdFx0T2JqZWN0LmtleXModGhpcy5fbG9nRGV0YWlsTWFwKS5mb3JFYWNoKGZpbGVuYW1lID0+IHtcblx0XHRcdGlmICghdGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXS50b21ic3RvbmVkKSB7XG5cdFx0XHRcdHVuc2VlbltmaWxlbmFtZV0gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0ZnMucmVhZGRpcih0aGlzLl9kaXJwYXRoLCAoZXJyLCBmaWxlbmFtZXMpID0+IHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0Y2FsbGJhY2soZXJyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVzID0gZmlsZW5hbWVzLnNsaWNlKGZpbGVuYW1lcy5sZW5ndGggLSB0aGlzLl9tYXhmaWxlcywgZmlsZW5hbWVzLmxlbmd0aCk7XG5cdFx0XHRcdGZpbGVzLmZvckVhY2goZmlsZW5hbWUgPT4ge1xuXHRcdFx0XHRcdGZpbGVuYW1lID0gcGF0aC5qb2luKHRoaXMuX2RpcnBhdGgsIGZpbGVuYW1lKTtcblx0XHRcdFx0XHRpZiAodGhpcy5fZmlsdGVyKGZpbGVuYW1lKSkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIHVuc2VlbltmaWxlbmFtZV07XG5cdFx0XHRcdFx0XHR0aGlzLl9vcHMucHVzaChjYiA9PiB0aGlzLl9zdGF0ZmlsZShmaWxlbmFtZSwgY2IpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdE9iamVjdC5rZXlzKHVuc2VlbikuZm9yRWFjaChmaWxlbmFtZSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5idXJ5KGZpbGVuYW1lKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y2FsbGJhY2sobnVsbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU3RhdCB0aGUgbmV3L3VwZGF0ZWQgZmlsZXMgaW4gbG9nIGRpcmVjdG9yeVxuXHQgKiBAcGFyYW0gZmlsZW5hbWUge3N0cmluZ30gUGF0aCB0byBmaWxlIHRvIGdldCBzdGF0cyBvZi5cblx0ICogQHBhcmFtIGNhbGxiYWNrXG5cdCAqL1xuXHRfc3RhdGZpbGUoZmlsZW5hbWUsIGNhbGxiYWNrKSB7XG5cdFx0ZGVidWcoJ19zdGF0ZmlsZScsIHtmaWxlbmFtZX0pO1xuXG5cdFx0ZnMuc3RhdChmaWxlbmFtZSwgKGVyciwgc3RhdHMpID0+IHtcblx0XHRcdGlmIChlcnIgJiYgZXJyLmNvZGUgPT09ICdFTk9FTlQnKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdKSB7XG5cdFx0XHRcdFx0dGhpcy5idXJ5KGZpbGVuYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYWxsYmFjayhudWxsKTsgLy8gRmlsZSBkZWxldGVkXG5cdFx0XHR9IGVsc2UgaWYgKGVycikge1xuXHRcdFx0XHRjYWxsYmFjayhlcnIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fb3BzLnB1c2goY2IgPT4gdGhpcy5fcHJvY2VzcyhmaWxlbmFtZSwgc3RhdHMsIGNiKSk7XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb2Nlc3MgdGhlIGZpbGVzXG5cdCAqIEBwYXJhbSBmaWxlbmFtZSB7c3RyaW5nfSBGaWxlbmFtZSB0byBjaGVja1xuXHQgKiBAcGFyYW0gc3RhdHMge29iamVjdH0gTGFzdCBtb2RpZmllZCBldGNcblx0ICogQHBhcmFtIGNhbGxiYWNrIHtmdW5jdGlvbn1cblx0ICovXG5cdF9wcm9jZXNzKGZpbGVuYW1lLCBzdGF0cywgY2FsbGJhY2spIHtcblx0XHRkZWJ1ZygnX3Byb2Nlc3MnLCB7ZmlsZW5hbWV9KTtcblx0XHRsZXQgQ1VSUkVOVF9GSUxFID0gMDtcblx0XHRzZXRJbW1lZGlhdGUoY2FsbGJhY2ssIG51bGwpO1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdO1xuXG5cdFx0aWYgKGluZm8gPT09IHVuZGVmaW5lZCAmJiBDVVJSRU5UX0ZJTEUgPCB0aGlzLl9tYXhmaWxlcykge1xuXHRcdFx0dGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXSA9IHtcblx0XHRcdFx0aW5vOiBzdGF0cy5pbm8sXG5cdFx0XHRcdG10aW1lOiBzdGF0cy5tdGltZSxcblx0XHRcdFx0c2l6ZTogc3RhdHMuc2l6ZSxcblx0XHRcdFx0d2F0ZXJtYXJrOiAwLFxuXHRcdFx0XHR0b21ic3RvbmVkOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdENVUlJFTlRfRklMRSsrO1xuXHRcdFx0dGhpcy5fb3BzLnB1c2goY2IgPT4gdGhpcy5fcmVhZChmaWxlbmFtZSwgY2IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaW5mby50b21ic3RvbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGluZm8uaW5vICE9PSBzdGF0cy5pbm8pIHtcblx0XHRcdFx0Ly8gRmlsZSByZXBsYWNlZC4uLiBjYW4ndCB0cnVzdCBpdCBhbnkgbW9yZVxuXHRcdFx0XHQvLyBpZiB0aGUgY2xpZW50IEFQSSBzdXBwb3J0ZWQgcmVwbGF5IGZyb20gc2NyYXRjaCwgd2UgY291bGQgZG8gdGhhdFxuXHRcdFx0XHQvLyBidXQgd2UgY2FuJ3QgeWV0LCBzbzpcblx0XHRcdENVUlJFTlRfRklMRSA9IDA7XG5cdFx0XHR0aGlzLmJ1cnkoZmlsZW5hbWUpO1xuXHRcdH0gZWxzZSBpZiAoc3RhdHMuc2l6ZSA+IGluZm8uc2l6ZSkge1xuXHRcdFx0XHQvLyBGaWxlIG5vdCByZXBsYWNlZDsgZ290IGxvbmdlci4uLiBhc3N1bWUgYXBwZW5kXG5cdFx0XHR0aGlzLl9vcHMucHVzaChjYiA9PiB0aGlzLl9yZWFkKGZpbGVuYW1lLCBjYikpO1xuXHRcdH0gZWxzZSBpZiAoaW5mby5pbm8gPT09IHN0YXRzLmlubyAmJiBpbmZvLnNpemUgPT09IHN0YXRzLnNpemUpIHtcblx0XHRcdFx0Ly8gRXZlbiBpZiBtdGltZSBpcyBkaWZmZXJlbnQsIHRyZWF0IGl0IGFzIHVuY2hhbmdlZFxuXHRcdFx0XHQvLyBlLmcuIF5aIHdoZW4gQ09QWSBDT04gdG8gYSBmYWtlIGxvZ1xuXHRcdFx0XHQvLyBkb24ndCBxdWV1ZSByZWFkXG5cdFx0fVxuXG5cdFx0aW5mby5tdGltZSA9IHN0YXRzLm10aW1lO1xuXHRcdGluZm8uc2l6ZSA9IHN0YXRzLnNpemU7XG5cdH1cblxuXHQvKipcblx0ICogUmVhZCB0aGUgZmlsZXNcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IFRoZSBmaWxlbmFtZSB0byByZWFkLlxuXHQgKiBAcGFyYW0gY2FsbGJhY2sge2Z1bmN0aW9ufVxuXHQgKi9cblx0X3JlYWQoZmlsZW5hbWUsIGNhbGxiYWNrKSB7XG5cdFx0Y29uc3Qge3dhdGVybWFyaywgc2l6ZX0gPSB0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdO1xuXHRcdGRlYnVnKCdfcmVhZCcsIHtmaWxlbmFtZSwgd2F0ZXJtYXJrLCBzaXplfSk7XG5cdFx0bGV0IGxlZnRvdmVyID0gQnVmZmVyLmZyb20oJycsICd1dGY4Jyk7XG5cblx0XHRjb25zdCBzID0gZnMuY3JlYXRlUmVhZFN0cmVhbShmaWxlbmFtZSwge1xuXHRcdFx0ZmxhZ3M6ICdyJyxcblx0XHRcdHN0YXJ0OiB3YXRlcm1hcmssXG5cdFx0XHRlbmQ6IHNpemVcblx0XHR9KTtcblx0XHRjb25zdCBmaW5pc2ggPSBlcnIgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdC8vIE9uIGFueSBlcnJvciwgZW1pdCB0aGUgZXJyb3IgYW5kIGJ1cnkgdGhlIGZpbGUuXG5cdFx0XHRcdHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xuXHRcdFx0XHR0aGlzLmJ1cnkoZmlsZW5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0c2V0SW1tZWRpYXRlKGNhbGxiYWNrLCBudWxsKTtcblx0XHRcdGNhbGxiYWNrID0gKCkgPT4ge1xuXHRcdFx0fTsgLy8gTm8tb3Bcblx0XHR9O1xuXHRcdHMub25jZSgnZXJyb3InLCBmaW5pc2gpO1xuXG5cdFx0cy5vbmNlKCdlbmQnLCBmaW5pc2gpO1xuXG5cdFx0cy5vbignZGF0YScsIGNodW5rID0+IHtcblx0XHRcdFx0Y29uc3QgaWR4ID0gY2h1bmsubGFzdEluZGV4T2YoJ1xcbicpO1xuXHRcdFx0XHRpZiAoaWR4IDwgMCkge1xuXHRcdFx0XHRcdGxlZnRvdmVyID0gQnVmZmVyLmNvbmNhdChbbGVmdG92ZXIsIGNodW5rXSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXS53YXRlcm1hcmsgKz0gaWR4ICsgMTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgb2JzID0gQnVmZmVyLmNvbmNhdChbbGVmdG92ZXIsIGNodW5rLnNsaWNlKDAsIGlkeCArIDEpXSlcblx0XHRcdFx0XHRcdFx0LnRvU3RyaW5nKCd1dGY4Jylcblx0XHRcdFx0XHRcdFx0LnJlcGxhY2UoL1xcdTAwMGUvaWdtLCAnJylcblx0XHRcdFx0XHRcdFx0LnJlcGxhY2UoL1xcdTAwMGYvaWdtLCAnJylcblx0XHRcdFx0XHRcdFx0LnNwbGl0KC9bXFxyXFxuXSsvKVxuXHRcdFx0XHRcdFx0XHQuZmlsdGVyKGwgPT4gbC5sZW5ndGggPiAwKVxuXHRcdFx0XHRcdFx0XHQubWFwKGwgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShsKVxuXHRcdFx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGRlYnVnKCdqc29uLnBhcnNlIGVycm9yJywge2xpbmU6IGx9KTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0bGVmdG92ZXIgPSBjaHVuay5zbGljZShpZHggKyAxKTtcblx0XHRcdFx0XHRcdGlmIChvYnMpIHtcblx0XHRcdFx0XHRcdFx0ZGVidWcoJ2RhdGEgZW1pdCcpO1xuXHRcdFx0XHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gdGhpcy5lbWl0KCdkYXRhJywgb2JzKSAmJiB0aGlzLmVtaXQoJ2ZpbmlzaGVkJykpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1ZygnZGF0YSBlbWl0Jyk7XG5cdFx0XHRcdFx0XHRcdHNldEltbWVkaWF0ZSgoKSA9PiB0aGlzLmVtaXQoJ2RhdGEnLCB7fSkgJiYgdGhpcy5lbWl0KCdmaW5pc2hlZCcpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdGZpbmlzaChlcnIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdH1cbn1cbi8qKlxuICogR2V0IHRoZSBwYXRoIG9mIHRoZSBsb2dzLlxuICogQHBhcmFtIGZwYXRoIHtzdHJpbmd9IFBhdGggdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgZGlyZWN0b3J5IGNvbnRhaW5zIGpvdXJuYWwgZmlsZXMuXG4gKi9cbmZ1bmN0aW9uIGlzQ29tbWFuZGVyTG9nKGZwYXRoKSB7XG5cdGNvbnN0IGJhc2UgPSBwYXRoLmJhc2VuYW1lKGZwYXRoKTtcblx0cmV0dXJuIGJhc2UuaW5kZXhPZignSm91cm5hbC4nKSA9PT0gMCAmJiBwYXRoLmV4dG5hbWUoZnBhdGgpID09PSAnLmxvZyc7XG59XG5cbmlmICghbW9kdWxlLnBhcmVudCkge1xuXHRwcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIGVyciA9PiB7XG5cdFx0Y29uc29sZS5lcnJvcihlcnIuc3RhY2sgfHwgZXJyKTtcblx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XG5cdH0pO1xuXG5cdGNvbnN0IHdhdGNoZXIgPSBuZXcgTG9nV2F0Y2hlcihERUZBVUxUX1NBVkVfRElSLCAzKTtcblx0d2F0Y2hlci5vbignZXJyb3InLCBlcnIgPT4ge1xuXHRcdHdhdGNoZXIuc3RvcCgpO1xuXHRcdGNvbnNvbGUuZXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGVyci5zdGFjayB8fCBlcnIpO1xuXHR9KTtcblx0d2F0Y2hlci5vbignZGF0YScsIG9icyA9PiB7XG5cdFx0b2JzLmZvckVhY2gob2IgPT4ge1xuXHRcdFx0Y29uc3Qge3RpbWVzdGFtcCwgZXZlbnR9ID0gb2I7XG5cdFx0XHRjb25zb2xlLmxvZygnXFxuJyArIHRpbWVzdGFtcCwgZXZlbnQpO1xuXHRcdFx0ZGVsZXRlIG9iLnRpbWVzdGFtcDtcblx0XHRcdGRlbGV0ZSBvYi5ldmVudDtcblx0XHRcdE9iamVjdC5rZXlzKG9iKS5zb3J0LnNvcnQoKS5mb3JFYWNoKGsgPT4ge1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZygnXFx0JyArIGssIG9iW2tdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn1cbiJdfQ==
