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
			// run every hour
			cron_restart: "0 * * * *",
			time: true,
			out_file: "logs/accumula-out.log",
			error_file: "logs/accumula-error.log",
			merge_logs: true,
		},
		{
			name: "accumula-bot-macro-briefing",
			cwd: __dirname,
			script: "node_modules/.bin/tsx",
			args: "--env-file=.env.macro src/macro/macroBriefingCli.ts",
			interpreter: "bash",
			autorestart: false,
			cron_restart: "0 14 * * *",
			time: true,
			out_file: "logs/accumula-macro-out.log",
			error_file: "logs/accumula-macro-error.log",
			merge_logs: true,
		},
		{
			name: "accumula-bot-telegram",
			cwd: __dirname,
			script: "node_modules/.bin/tsx",
			args: "--env-file=.env src/notifications/telegram/botCli.ts",
			interpreter: "bash",
			autorestart: true,
			time: true,
			out_file: "logs/accumula-telegram-out.log",
			error_file: "logs/accumula-telegram-error.log",
			merge_logs: true,
		},
	],
};
