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

const activeJobs: string[] = []; // A list of uuids of active jobs
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

		// req.url should always be set, but in the typescript definitions it says it can be undefined... I wonder how
		if (req.url === undefined) {
			res.statusCode = 400;
			res.end('Your request is utterly invalid in a deeply disturbing way');
			return;
		}

		if (req.url.startsWith('/status?')) {
			const statusUuid: string = req.url.split('?')[1];
			if (activeJobs.includes(statusUuid)) {
				res.statusCode = 202;
				res.end('');
			} else {
				res.statusCode = 404;
				res.end('Not Found - Job might be finnished or was never created');
			}
			return;
		}

		// If this specific url does not exist in the stdin config, its a 404
		if (!urls.includes(req.url)) {
			res.statusCode = 404;
			res.end('Not Found - No command found for URL: "' + req.url + '"');
			return;
		}

		// Get the specific command for this url
		let cmd: string | boolean = false;
		urltocmds.forEach(el => {
			if (el.url === req.url) cmd = el.cmd;
		});

		if (cmd === false) {
			res.statusCode = 500;
			res.end('Internal Server Error - Command not found for URL: "' + req.url + '"');
			return;
		}

		if (!cmd) {
			res.statusCode = 500;
			res.end('Internal Server Error - Cmd: "' + cmd + '" is invalid for URL: "' + req.url + '"');
			return;
		}

		const jobUuid = uuid.v1();
		activeJobs.push(jobUuid);

		console.log('Running command: "' + cmd + '" for URL: "' + req.url + '" with uuid: ' + jobUuid);
		res.statusCode = 202;
		res.end('Accepted - Running command for URL: "' + req.url + '"\nuuid: ' + jobUuid);

		exec(cmd, (err, stdout, stderr) => {
			if (err) {
				console.error(jobUuid + ': Command failed: "' + cmd + '", err: ' + err.message);
			}

			if (stderr) {
				console.error(jobUuid + ': stderr: ' + stderr);
			}

			if (stdout) {
				console.log(jobUuid + ': stdout: ' + stdout);
			}

			activeJobs.splice(activeJobs.indexOf(jobUuid), 1);
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