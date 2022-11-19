There are a few environment variables that Hindenburg makes use of that you can use, for example to automate setting up a server in production.

### Setting Environment Variables
If you're unsure how to set environment variables in your terminal, check out , or

#### On Windows
There are 2 ways you can set environment variables on Windows:

* Follow [this guide](https://www.minitool.com/news/environment-variables-windows-10-005.html) to set environment variables via the system settings
* Or, prefix every command you run with `npx cross-env VARIABLE=VALUE`, for example:

```sh
npx cross-env HINDENBURG_PLUGINS="C:/Users/essma/Downloads/my-hindenburg-plugins,C:/Users/essma/Documents/Hindenburg/plugins" yarn start
```

### On Linux
Follow [this guide](https://phoenixnap.com/kb/linux-set-environment-variable#ftoc-heading-9) to learn how to set environment variables on Linux.

### `HINDENBURG_CONFIG`
You can set the `HINDENBURG_CONFIG` variable to the location of a `config.json` file in the system to tell hindenburg where to look for configuration for the server.

> By default, Hindenburg will look for your `config.json` in the **current working directory**, i.e. where you have your terminal opened.

> Note that the location has to be **absolute**, meaning that it must begin with either `Drive:/` on windows or `/` on linux, and be the complete path to the file.

> Check out the {@page ../configuration.md} page for information on configuring Hindenburg

For example, if you downloaded a `config.json` into your downloads directory, you could set `HINDENBURG_CONFIG` to `C:/Users/essma/Downloads/config.json` and Hindenburg would use that.

On Windows:

![image](https://user-images.githubusercontent.com/60631511/144691905-6af9bb0e-53d1-4e50-ac9e-72406ac73d33.png)

On Linux (WSL2):

![image](https://user-images.githubusercontent.com/60631511/144691372-44e34c72-69b0-4289-915f-1e12f759fac2.png)

### `HINDENBURG_PLUGINS`
The `HINDENBURG_PLUGINS` allows you to specify where Hindenburg should look for plugins to load, with **absolute** paths to each location separated by commas (`,`).

> By default, Hindenburg will look for a `/plugins` directory in the **current working directory**, i.e. where you have your terminal opened.

For example, you might want to use someone else's plugin folder that you downloaded as well as your plugins in your hindenburg directory, so you might set `HINDENBURG_PLUGINS` to:
`C:/Users/essma/Downloads/my-hindenburg-plugins,C:/Users/essma/Documents/Hindenburg/plugins`

> Notice how the two directories are separated by commas (`,`).

On Windows:

![image](https://user-images.githubusercontent.com/60631511/144691936-b73582bd-0c34-4451-8f30-cf48ae5cc3d1.png)

On Linux (WSL2):

![image](https://user-images.githubusercontent.com/60631511/144691992-bb446c6b-83e0-4187-b99d-7a32e598a788.png)

### `HINDENBURG_CLI_ARGS`
This environment variable very simply allows you to pass extra cli arguments into Hindenburg that you don't specify with `yarn start` or `yarn dev`.

For example, if you wanted to change the port without changing the command to be run, you could set `HINDENBURG_CLI_ARGS` to `--socket.port 22123`.

On Windows:

![image](https://user-images.githubusercontent.com/60631511/144692048-57915458-c4b7-4fe4-9bf2-feb16c988089.png)

On Linux (WSL2):

![image](https://user-images.githubusercontent.com/60631511/144692313-e5db0b48-b9eb-4089-9f89-cada1fa724f6.png)
