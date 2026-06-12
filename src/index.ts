async function main() {
	console.info("Hello, world!");
}

main().then((...args) => {
	args.length && console.info(...args);
	process.exit(0);
});
