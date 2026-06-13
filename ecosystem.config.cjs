/** @type {import('pm2').StartOptions} */
module.exports = {
	apps: [
		{
			name: "accumula-bot",
			cwd: __dirname,
			// PM2 defaults to running `script` with Node; tsx lives in a shell wrapper.
			script: "node_modules/.bin/tsx",
			args: "--env-file=.env src/index.ts",
			interpreter: "bash",
			autorestart: false,
			// 06:00, 14:00, and 22:00 in the server's local timezone
			cron_restart: "0 6,14,22 * * *",
			time: true,
			out_file: "logs/accumula-out.log",
			error_file: "logs/accumula-error.log",
			merge_logs: true,
		},
		{
			name: "accumula-bot-telegram",
			cwd: __dirname,
			script: "node_modules/.bin/tsx",
			args: "--env-file=.env src/notifications/telegram/dailySummaryCli.ts",
			interpreter: "bash",
			autorestart: false,
			cron_restart: "0 15 * * *",
			time: true,
			out_file: "logs/accumula-telegram-out.log",
			error_file: "logs/accumula-telegram-error.log",
			merge_logs: true,
		},
	],
};
