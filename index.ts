import http from 'http';
import { exec } from 'child_process';
const stdin = process.stdin;
const port = process.env.PORT || 3000;

interface urltocmd {
	url: string;
	cmd: string;
}

const inputChunks: string[] = [];

stdin.resume();
stdin.setEncoding('utf8');

stdin.on('data', chunk => {
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
			if (err) throw err;

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