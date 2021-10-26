(async () => {
    const { default: setupScript } = await import("./_setup");

    setupScript(false);
})();
