(async () => {
    const { default: setupScript } = await import("./_setup");

    await setupScript(false);
})();
