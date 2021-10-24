### Discord Server
If you're ever having issues installing Hindenburg, want to discuss updates or
just want to chat, you can join the [discord server](https://discord.gg/8ewNJYmYAU).

### Copy the Source Code
Hindenburg uses [Node.js](https://nodejs.org), so it can run on virtually every
platform with no configuration.

#### Prerequisites
You will need to install the following programs to get started with Hindenburg.
* [Node.js](https://nodejs.org) (at least >=v14, preferably the current LTS)
* [NPM](https://npmjs.com) (Comes pre-installed with Node.js)
* [Git](https://git-scm.org)
* A terminal of your choice (You can just use Windows command prompt)

Open your command prompt in the folder where you want to install Hindenburg.

> If you're unsure about this, check out [this wikihow article](https://www.wikihow.com/Open-a-Folder-in-Cmd).

Run the following commands:

**Clone the repository from GitHub**
```sh
git clone https://github.com/skeldjs/Hindenburg
```
**Move into the cloned folder**
```sh
cd Hindenburg
```
**Install dependencies**
```sh
yarn
```
**Build Hindenburg**
```sh
yarn build
```

Hindenburg should now be ready to roll!

### Setup
Hindenburg will run a short setup the first time you [start it](#Quick%20Start)
(or you can manually run the `yarn setup` command), running through a few basic
configuration questions. You can just accept the recommended answers if you're
unsure.

### Configuration
Hindenburg will look for a `config.json` in the folder where you start the server,
see the `HINDENBURG_CONFIG` [environment variable](#Hindenburg%20Config)
to change where Hindenburg looks for a config file.

By default, Hindenburg will automatically check for updates from the github
repository, you can configure Hindenburg to auto-update, or to stop checking for
updates completely.

Check out the {@page Configuration} guide for more
information.

### Environment Variables
Hindenburg also allows you to change where your config file is located and also
where to find locally installed plugins.

> Follow [this article](https://www.architectryan.com/2018/08/31/how-to-change-environment-variables-on-windows-10/)
if you're unsure how to set environment variables on Windows.

> On MacOS or Linux, you can check out [this article](https://linuxconfig.org/how-to-set-and-list-environment-variables-on-linux).

#### `HINDENBURG_CONFIG`
Absolute path to Hindenburg's `config.json`

**Example:** `HINDENBURG_CONFIG="C:/Users/Edward/Documents/Hindenburg/config.json"`

> Check out the {@page Configuration} guide for more
information on configuring Hindenburg.

#### `HINDENBURG_PLUGINS`
A list of absolute paths to folders where Hindenburg can look for locally installed folders
on your machine, separated by commas (`,`).

**Example:** `HINDENBURG_PLUGINS="C:/Users/Edward/Documents/Hindenburg/plugins,C:/Users/Edward/Downloads/Hindenburg Plugins"`

### Quick Start
#### In Production
If you want to run Hindenburg in production (i.e. You're not planning on doing
any debugging or development) then you can use `yarn start`.

> Remember to build Hindenburg with `yarn build` beforehand.

#### In Development
If you're developing with Hindenburg (e.g. plugins or Hindenburg itself), you can
run `yarn dev`. This will compile all of the typescript files on the fly so you
don't have to worry about building all the time.


### Advanced Start
if you're looking to host a Hindenburg server full-time and want to make sure that
your server never goes down if Hindenburg ever crashes ([it would not be the first time](https://en.wikipedia.org/wiki/Hindenburg_disaster)),
you can use a process manager like `pm2` to ensure your server restarts if it
goes down.

If you're hosting multiple Hindenburg server nodes and want a way to balance
connection load between them, check out the official [load-balancer](https://github.com/SkeldJS/Hindenburg-Loadbalancer).
