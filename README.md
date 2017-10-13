# ed-logwatcher
Elite: Dangerous Log Watcher

## Install
```bash
npm i --save ed-logwatcher
```

## Usage
```javascript
// See https://edlogs.williamblythe.info for the JSDocs
const {LogWatcher} = require('ed-logwatcher');
const DEFAULT_SAVE_DIR = path.join(
	require('os').homedir(),
	'Saved Games',
	'Frontier Developments',
	'Elite Dangerous'
);
const watcher = new LogWatcher(DEFAULT_SAVE_DIR, 3);
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
```
