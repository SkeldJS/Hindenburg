> Note that load ordering configuration will not apply if your plugin is depended on by any other plugins; as this ordering will be overriden by whatever order the plugin has its dependencies listed in.

> It also will not apply if your plugin is loaded later through the CLI or by another plugin, or if it is hot reloaded.