import test from 'ava';
import {LogWatcher} from './lib/index';

const DEFAULT_SAVE_DIR = require('path').join(
	__dirname,
	'testlogs'
);
let Watcher;

test.cb.serial('Starts', t => {
	Watcher = new LogWatcher(DEFAULT_SAVE_DIR, 4);
	Watcher.on('error', e => {
		t.fail(e);
	});
	t.end();
});

test.cb.serial('Data received', t => {
	Watcher.on('data', data => {
		t.truthy(data);
		t.end();
	})
});

test.cb.serial('Finish emitted', t => {
	Watcher.on('finished', () => {
		t.end();
	});
});

test.cb.serial('Stops', t => {
	Watcher.stop();
	Watcher.on('stopped', () => {
		t.true(Watcher.stopped);
		t.end();
	});
});

