/**
 * @file The file that does the watcher processing.
 * @author willyb321
 * @copyright MIT
 */

 /**
 * @module Watcher
 */
'use strict';

const events = require('events');
const os = require('os');
const path = require('path');
const fs = require('fs');
const debug = require('debug')('ed-logwatcher');
const chokidar = require('chokidar');
const util = require('util');
const readFile = util.promisify(fs.readFile);

/**
 * Interval in MS to poll directory at.
 * @type {number}
 */
const POLL_INTERVAL = 1000;
/**
 * Default path to journal files for Elite.
 * @type {string}
 */
const DEFAULT_SAVE_DIR = path.join(
	os.homedir(),
	'Saved Games',
	'Frontier Developments',
	'Elite Dangerous'
);

/**
 * @class The main class.
 *
 * @tutorial LogWatcher-Tutorial
 */
class LogWatcher extends events.EventEmitter {
	/**
	 * Construct the log watcher.
	 *
	 * @param dirpath {string} The directory to watch.
	 */
	constructor(dirpath) {
		super();

		this._dirpath = dirpath || DEFAULT_SAVE_DIR;
		this._offsets = {};
		this._ops = [];
		this._op = null;
		this._startTime = new Date();
		this._watcher = null;
		this.stopped = true;
	}

	/**
 	 * Stop running
	 */
	stop() {
		debug('stop');
		if (!this.stopped) {
			this._watcher.close();
			this._watcher = null;
			this.stopped = true;
			this.emit('stop');
		}
	}

	/**
	 * Start running
	 */
	start() {
		debug('start');
		if (this.stopped) {
			this._watch();
			this.stopped = false;
			this.emit('start', this._dirpath);
		}
	}

	/**
	 * Start watching the saved game directory.
	 */
	_watch() {
		debug('_watch', this._dirpath);
		const watcher = this._watcher = chokidar.watch(this._dirpath, {
			alwaysStat: true,
			atomic: false,
			depth: 0,
			ignoreInitial: true,
		});
		watcher.on('unlink', f => this._wunlinked(f));
		watcher.on('add', f => this._wadded(f));
		watcher.on('change', f => this._wchanged(f));
	}

	/**
	 * Handle notification of a deleted file.
	 *
	 * @param {string} filename The path to the deleted file
	 */
	_wunlinked(filename) {
		debug('_wunlinked', filename);
		delete this._offsets[filename];
	}

	/**
	 * Handle notification of an added file.
	 *
	 * @param {string} filename The path to the added file
	 */
	_wadded(filename) {
		debug('_wadded', filename);
		this._read(filename);
	}

	/**
	 * Handle notification of an changed file.
	 *
	 * @param {string} filename The path to the changed file
	 */
	_wchanged(filename) {
		debug('_wchanged', filename);
		this._read(filename);
	}

	/**
	 * Read a file's content, and emit events appropriately.
	 *
	 * @param filename {string} The filename to read.
	 */
	_read(filename) {
		if (path.extname(filename) === '.json') {
			this._readSingle(filename).catch(err => this.emit('error', err));
			return;
		} else {
			this._readMany(filename).catch(err => this.emit('error', err));
			return;
		}
	}

	/**
	 * Read a file's content, expecting just one JSON blob, and emit events.
	 *
	 * @param filename {string} The filename to read.
	 */
	async _readSingle(filename) {
		debug('readSingle', filename);
		const text = await readFile(filename, 'utf8');
		if (!text) {
			return;
		}

		let ob;
		try {
			ob = JSON.parse(text);
		} catch (err) {
			debug('json parse failure', text.length, text);
			return;
		}
		this.emit('data', [ob]);
		this.emit('finished');
	}

	/**
	 * Read a file's content, expecting many newline separated JSON blobs,
	 * and emit events.
	 *
	 * @param filename {string} The filename to read.
	 */
	async _readMany(filename) {
		debug('_readMany', filename);
		const watermark = this._offsets[filename] || 0;
		const buffer = (await readFile(filename)).slice(watermark);
		this._offsets[filename] = watermark + buffer.byteLength;
		const obs = buffer.toString('utf8')
			.toString('utf8')
			.replace(/\u000e/igm, '')
			.replace(/\u000f/igm, '')
			.split(/[\r\n]+/)
			.filter(text => !!text)
			.map(text => {
				try {
					return JSON.parse(text)
				} catch (e) {
					debug('json parse failure', text.length, text);
				}
			})
			.filter(ob => !!ob);
		this.emit('data', obs);
		this.emit('finished');
	}

	/**
	 * Get our current offset into a file.
	 */
	_getWatermark(filename) {
		if (path.extname(filename).toLowerCase() === '.json') {
			return 0;
		} else {
			return  this._offsets[filename] || 0;;
		}
	}
}

module.exports = {
	DEFAULT_SAVE_DIR,
	LogWatcher,
}

if (!module.parent) {
	debug('acting as crude CLI...');
	process.on('uncaughtException', err => {
		console.error(err.stack || err);
		throw new Error(err.stack || err);
	});

	const watcher = new LogWatcher(DEFAULT_SAVE_DIR);
	watcher.on('start', dpath => {
		console.error(`Watching: ${dpath}`);
	});
	watcher.on('error', err => {
		// watcher.stop();
		console.error(err.stack || err);
		console.error('keeping going...');
		// throw new Error(err.stack || err);
	});
	watcher.on('data', obs => {
		obs.forEach(ob => {
			const {timestamp, event} = ob;
			if (!(timestamp && event)) {
				console.log('\n what', ob);
			}
			console.log('\n' + timestamp, event);
			delete ob.timestamp;
			delete ob.event;
			Object.keys(ob).sort().forEach(k => {
				// console.log('\t' + k, ob[k]);
			});
		});
	});
	watcher.start();
}
