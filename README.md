# ed-logwatcher
Elite: Dangerous Log Watcher

## Install
```bash
npm i --save ed-logwatcher
```

## Usage
```javascript
// See https://edlogs.williamblythe.info for the JSDocs
const { LogWatcher, DEFAULT_SAVE_DIR} = require('ed-logwatcher');
const watcher = new LogWatcher(DEFAULT_SAVE_DIR);
watcher.on('error', err => {
	watcher.stop();
	console.error(err.stack || err);
	throw new Error(err.stack || err);
});
watcher.on('finished', () => {
	// Watcher has read through the max files allowed, won't emit again until another entry
	// Now would be a good time to load the data, if you are doing something like elite-journal.
	});
watcher.on('data', obs => {
	// Emitted for each file in max files allowed.
	obs.forEach(ob => {
		const {timestamp, event} = ob;
		console.log('\n' + timestamp, event);
		delete ob.timestamp;
		delete ob.event;
		Object.keys(ob).sort().forEach(k => {
			console.log('\t' + k, ob[k]);
		});
	});
});
watcher.start();
```

## Change Log

### 2.0.0

* Exported `DEFAULT_SAVE_DIR`
* Removed `maxfiles` and `ignoreInitial` arguments to `LogWatcher`
* Switched from manual polling to `chokidar`
* Renamed `Started` event to `start`
* Renamed `stopped` event to `stop`
* Emitted the directory being watched with the `start` event
* Permitted both newline separated JSON `*.log` and single JSON blob `*.json` files

## Projects Using ed-logwatcher
- [`elite-journal`](https://github.com/willyb321/elite-journal)
- [`ed-fleet-client`](https://github.com/purrcat259/ed-fleet-client)

## Contributing
1. Fork
2. Create branch (`git checkout -b my-branch`)
3. Make changes
4. Commit
5. Open PR.
6. ???
7. Profit.
