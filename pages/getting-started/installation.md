### Discord Server
If you're ever having issues installing Waterway, want to discuss updates or just want to chat, you can join the [discord server](https://discord.gg/8ewNJYmYAU).

## Official setup
> If you'd rather use [Docker](https://docker.com), check out the [docker setup](#docker-setup) section.

Waterway uses [Node.js](https://nodejs.org), so it can run on virtually every platform with no extra setup.

#### Prerequisites
You will need to install the following programs to get started with Waterway.
* [Node.js](https://nodejs.org) (at least >=v14, preferably the current LTS)
* [NPM](https://npmjs.com) (Comes pre-installed with Node.js)
* [Git](https://git-scm.org)
* A terminal of your choice (You can just use Windows command prompt)

Open your command prompt in the folder where you want to install Waterway.

> If you're unsure about this, check out [this wikihow article](https://www.wikihow.com/Open-a-Folder-in-Cmd).

Run the following commands:

**Clone the repository from GitHub**
```sh
git clone https://github.com/skeldjs/Waterway
```
**Move into the cloned folder**
```sh
cd Waterway
```
**Install dependencies**
```sh
yarn
```
**Build Waterway**
```sh
yarn build
```

Waterway should now be ready to roll!

### Setup
Waterway will run a short setup the first time you [start it](#quick-start) (or you can manually run the `yarn setup` command), running through a few basic configuration questions. You can just accept the recommended answers if you're unsure.

### Configuration
Waterway will look for a `config.json` in the folder where you start the server, see the `WATERWAY_CONFIG` environment variable to change where Waterway looks for a config file.

By default, Waterway will automatically check for updates from the github
repository, you can configure Waterway to auto-update, or to stop checking for
updates completely.

Check out the [Configuration](./Configuration.html) page for more information.

### Environment Variables
Waterway also allows you to change where your config file is located and also
where to find locally installed plugins.

Check out the [Environment Variables](./Environment%20Variables.html) page for more information

### Quick Start
#### In Production
If you want to run Waterway in production (i.e. You're not planning on doing any debugging or development) then you can use `yarn start`.

> Remember to build Waterway with `yarn build` beforehand.

#### In Development
If you're developing with Waterway (e.g. plugins or Waterway itself), you can run `yarn dev`. This will compile all of the typescript files on the fly so you don't have to worry about building all the time.

### Updating
> Enable [auto-updating](https://waterway.js.org/pages/getting-started/configuration/index.html#autoupdate) in your `config.json` to automatically update Waterway when you start your server.

Waterway will of course need updating frequently! Run the following commands to get Waterway updated to the latest version:

**Fetch latest changes**
```sh
git pull
```
**Install dependencies**
```sh
yarn
```
**Re-build Waterway**
```sh
yarn build
```

> Make sure to join [the discord](#discord-server) to stay up-to-date with anything new happening to Waterway, or to discuss any changes!

### Advanced Start
if you're looking to host a Waterway server full-time and want to make sure that your server never goes down if Waterway ever crashes ([it would not be the first time](https://en.wikipedia.org/wiki/Waterway_disaster)), you can use a process manager like `pm2` to ensure your server restarts if it goes down.

If you're hosting multiple Waterway server nodes and want a way to balance connection load between them, check out the official [load balancer](https://github.com/SkeldJS/WaterwayLoadbalancer).

## Docker Setup
Alternatively, you can use [Docker](https://docker.com) to run your Waterway server.

In short, Docker is like a virtual machine that only virtualises the operating system. This allows you to have a standardised way to run Waterway on any system, making it very helpful if you plan to host a large server and require decent scaling.

> Check out the [official explanation](https://www.docker.com/resources/what-container) for more information.

### Prerequisites
* [Docker](https://docker.com) (duh)
* A terminal of your choice (You can just use Windows command prompt)

> Check out [this article](https://docs.docker.com/engine/install) if you need help installing Docker.

### Start Waterway :)
```sh
docker run --name Waterway -p 22023:22023/udp waterway/waterway:latest
```

... and done! Waterway should now be up and running with a single command.

### Advanced Setup
For an advanced setup, check out the [dockerhub repo page](https://hub.docker.com/r/waterway/waterway).
