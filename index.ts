import * as dotenv from 'dotenv';
import uuid from 'uuid';
import http from 'http';
import { exec } from 'child_process';

dotenv.config(); // Populate process.env from .env file

const stdin = process.stdin;
const port = process.env.PORT || 3000; // Default to port 3000 if none is provided in process.env.PORT

interface urltocmd {
	url: string;
	cmd: string;
}

interface jobHistoryEntry {
	uuid: string;
	cmd: string;
	exitStatus: number | undefined;
	stdout: string;
	stderr: string;
}

const jobHistory: jobHistoryEntry[] = [];
const inputChunks: string[] = []; // stdin will stream in chunks, this is an array where we collect them
let inputStarted: boolean = false; // This is an indicator if we have started to recieve stdin

stdin.resume(); // Make sure we start processing stdin
stdin.setEncoding('utf8');

// We get data on stdin \o/
stdin.on('data', chunk => {
	inputStarted = true;
	inputChunks.push(chunk);
});

// When all stdin is read, do this
stdin.on('end', () => {
	const urltocmds: urltocmd[] = JSON.parse(inputChunks.join());

	// Get all valid urls
	const urls = urltocmds.map(el => el.url);

	// This functionis ran on each request to the server
	function requestHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
		res.setHeader('Content-Type', 'application/json');
		res.setHeader('X-Powered-By', 'urltocmd');

		// req.url should always be set, but in the typescript definitions it says it can be undefined... I wonder how
		if (req.url === undefined) {
			res.statusCode = 400;
			res.end(JSON.stringify({ error: 'Your request is utterly invalid in a deeply disturbing way' }));
			return;
		}

		if (req.url.startsWith('/status?')) {
			const statusUuid: string = req.url.split('?')[1];

			for (let i = 0; jobHistory.length !== i; i ++) {
				const entry = jobHistory[i];
				if (entry.uuid === statusUuid) {
					res.statusCode = 200;
					res.end(JSON.stringify({ message: 'Job found', job: entry }));
					return;
				}
			}

			res.statusCode = 404;
			res.end(JSON.stringify({ error: 'Not Found - Job not found in history', uuid: statusUuid }));
		}

		// If this specific url does not exist in the stdin config, its a 404
		if (!urls.includes(req.url)) {
			res.statusCode = 404;
			res.end(JSON.stringify({ error: 'Not Found - No command found for URL', url: req.url }));
			return;
		}

		// Get the specific command for this url
		let cmd: string | boolean = false;
		urltocmds.forEach(el => {
			if (el.url === req.url) cmd = el.cmd;
		});

		if (cmd === false) {
			res.statusCode = 500;
			res.end(JSON.stringify({ error: 'Internal Server Error - URL in command list, but no command found for it', url: req.url }));
			return;
		}

		if (!cmd) {
			res.statusCode = 500;
			res.end(JSON.stringify({ error: 'Internal Server Error - URL in command list, but the command is empty', cmd, url: req.url }));
			return;
		}

		const job: jobHistoryEntry = {
			uuid: uuid.v1(),
			cmd,
			exitStatus: undefined,
			stdout: '',
			stderr: '',
		};
		jobHistory.push(job);

		// Remove the last entry of the jobHistory if it is larger than 1000
		if (jobHistory.length > 1000) {
			jobHistory.shift();
		}

		console.log('Running command: "' + cmd + '" for URL: "' + req.url + '" with uuid: ' + job.uuid);
		res.statusCode = 202;
		res.end(JSON.stringify({ message: 'Accepted', url: req.url, cmd, uuid: job.uuid }));

		exec(cmd, (err: any /* Any, because the default error type does not include "status", but this one does */, stdout, stderr) => {
			if (err) {
				console.error(job.uuid + ': Command failed: "' + cmd + '", err: ' + err.message);
				job.exitStatus = err.status;
				job.stderr += err.message;

				// Something failed, so if we did not get a proper exit status code, default to 1
				if (job.exitStatus === undefined) {
					job.exitStatus = 1;
				}

				return;
			}

			if (stderr) {
				console.error(job.uuid + ': stderr: ' + stderr);
				job.stderr += stderr;
			}

			if (stdout) {
				console.log(job.uuid + ': stdout: ' + stdout);
				job.stdout += stdout;
			}

			job.exitStatus = 0;
		});
	}

	http.createServer(requestHandler).listen(port, (): void => {
		console.log('Server listening to ' + port);
	});
});

setTimeout(() => {
	if (inputStarted === false) {
		console.error('No input received on STDIN, can not create any URLs to run commands from, exiting.');
		process.exit(1);
	}
}, 100);