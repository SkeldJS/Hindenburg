import setupScript from "./_setup";

(async () => {
    await setupScript(process.argv.includes("--default") || process.argv.includes("-d"));
})();
