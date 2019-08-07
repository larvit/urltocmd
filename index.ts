import * as dotenv from 'dotenv';
import http from 'http';
import { exec } from 'child_process';

dotenv.config();

const stdin = process.stdin;
const port = process.env.PORT || 3000;

interface urltocmd {
	url: string;
	cmd: string;
}

const inputChunks: string[] = [];
let inputStarted: boolean = false;

stdin.resume();
stdin.setEncoding('utf8');

stdin.on('data', chunk => {
	inputStarted = true;
	inputChunks.push(chunk);
});

stdin.on('end', () => {
	const urltocmds: urltocmd[] = JSON.parse(inputChunks.join());

	const urls = urltocmds.map(el => el.url);

	function requestHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
		if (req.url === undefined) {
			res.statusCode = 400;
			res.end('Your request is utterly invalid in a deeply disturbing way');
			return;
		}

		if (!urls.includes(req.url)) {
			res.statusCode = 404;
			res.end('Not Found - No command found for URL: "' + req.url + '"');
			return;
		}

		const cmd = urltocmds.map(el => {
			if (el.url === req.url) {
				return el.cmd;
			} else {
				return false;
			}
		})[0];

		if (cmd === false || !cmd) {
			res.statusCode = 500;
			res.end('Internal Server Error - Something is wrong with the command for URL: "' + req.url + '"');
			return;
		}

		console.log('Running command: "' + cmd + '" for URL: "' + req.url + '"');
		res.statusCode = 202;
		res.end('Accepted - Running command for URL: "' + req.url + '"');

		exec(cmd, (err, stdout, stderr) => {
			if (err) {
				console.error('Command failed: "' + cmd + '", err: ' + err.message);
			}

			if (stderr) {
				console.error('stderr: ' + stderr);
			}

			if (stdout) {
				console.log('stdout: ' + stdout);
			}
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