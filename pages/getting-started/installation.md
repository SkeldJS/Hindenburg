### Discord Server
If you're ever having issues installing Hindenburg, want to discuss updates or just want to chat, you can join the [discord server](https://discord.gg/8ewNJYmYAU).

## Official setup
> If you'd rather use [Docker](https://docker.com), check out the [docker setup](#docker-setup) section.

Hindenburg uses [Node.js](https://nodejs.org), so it can run on virtually every platform with no extra setup.

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
Hindenburg will run a short setup the first time you [start it](#quick-start) (or you can manually run the `yarn setup` command), running through a few basic configuration questions. You can just accept the recommended answers if you're unsure.

### Configuration
Hindenburg will look for a `config.json` in the folder where you start the server, see the `HINDENBURG_CONFIG` environment variable to change where Hindenburg looks for a config file.

By default, Hindenburg will automatically check for updates from the github
repository, you can configure Hindenburg to auto-update, or to stop checking for
updates completely.

Check out the [Configuration](./Configuration.html) page for more information.

### Environment Variables
Hindenburg also allows you to change where your config file is located and also
where to find locally installed plugins.

Check out the [Environment Variables](./Environment%20Variables.html) page for more information

### Quick Start
#### In Production
If you want to run Hindenburg in production (i.e. You're not planning on doing any debugging or development) then you can use `yarn start`.

> Remember to build Hindenburg with `yarn build` beforehand.

#### In Development
If you're developing with Hindenburg (e.g. plugins or Hindenburg itself), you can run `yarn dev`. This will compile all of the typescript files on the fly so you don't have to worry about building all the time.

### Updating
> Enable [auto-updating](https://hindenburg.js.org/pages/getting-started/configuration/index.html#autoupdate) in your `config.json` to automatically update Hindenburg when you start your server.

Hindenburg will of course need updating frequently! Run the following commands to get Hindenburg updated to the latest version:

**Fetch latest changes**
```sh
git pull
```
**Install dependencies**
```sh
yarn
```
**Re-build Hindenburg**
```sh
yarn build
```

> Make sure to join [the discord](#discord-server) to stay up-to-date with anything new happening to Hindenburg, or to discuss any changes!

### Advanced Start
if you're looking to host a Hindenburg server full-time and want to make sure that your server never goes down if Hindenburg ever crashes ([it would not be the first time](https://en.wikipedia.org/wiki/Hindenburg_disaster)), you can use a process manager like `pm2` to ensure your server restarts if it goes down.

If you're hosting multiple Hindenburg server nodes and want a way to balance connection load between them, check out the official [load balancer](https://github.com/SkeldJS/HindenburgLoadbalancer).

## Docker Setup
Alternatively, you can use [Docker](https://docker.com) to run your Hindenburg server.

In short, Docker is like a virtual machine that only virtualises the operating system. This allows you to have a standardised way to run Hindenburg on any system, making it very helpful if you plan to host a large server and require decent scaling.

> Check out the [official explanation](https://www.docker.com/resources/what-container) for more information.

### Prerequisites
* [Docker](https://docker.com) (duh)
* A terminal of your choice (You can just use Windows command prompt)

> Check out [this article](https://docs.docker.com/engine/install) if you need help installing Docker.

### Start Hindenburg :)
```sh
docker run --name Hindenburg -p 22023:22023/udp hindenburg/hindenburg:latest
```

... and done! Hindenburg should now be up and running with a single command.

### Advanced Setup
For an advanced setup, check out the [dockerhub repo page](https://hub.docker.com/r/hindenburg/hindenburg).
