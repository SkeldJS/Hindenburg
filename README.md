# Hindenburg
Hindenburg is a completely customisable and scalable Among Us server, complete
with advanced plugins and a sophisticated and configurable anti-cheat.

With unparalleled support for [Reactor](https://github.com/NuclearPowered/Reactor),
it's perfect for developers and for private modded game servers.

It uses [SkeldJS](https://github.com/skeldjs/SkeldJS) to interface with the Among Us
protocol, as well as keeping state.

### Discord Server
Hindenburg has its own channels on the SkeldJS discord server, be sure to drop
in if you need help installing, want to discuss Hindenburg, or just want to chat:
https://discord.gg/8ewNJYmYAU

## Getting Started
Hop straight into using Hindenburg with:
```sh
npm install -g yarn
git clone https://github.com/skeldjs/Hindenburg
cd Hindenburg
yarn
yarn setup
yarn build
yarn start
```

Or if you're using Docker:
```sh
docker run \
    --name Hindenburg \
    -p 22023:22023/udp \
    hindenburg/hindenburg:latest
```

> If you're looking for a full guide, check out the [installation](https://hindenburg.js.org/pages/getting-started/installation.html) page.

## Features
![server as a host](https://github.com/SkeldJS/Hindenburg/raw/master/media/server-as-a-host.png)

As Hindenburg is powered by SkeldJS, all client-side host logic is implemented accurately on the server.

Server-As-A-Host (**SaaH**) technology gives Hindenburg complete authority over games, meaning it actively participates in gameplay — making it more than just a glorified relay network.

Your players won't notice a _thing_, but in the background it gives server owners and plugins the ability to completely revamp the game, and making Hindenburg's anti-cheat much more able to detect unwanted behaviour.

SaaH also has the potential to make the game more fair for all players — especially when the host has a high latency. This is because it skips asking the host to verify kills and system sabotages, and does all of the logic on the server quicker.

![configuration](https://github.com/SkeldJS/Hindenburg/raw/master/media/configuration.png)
Hindenburg is completely customisable with a simple json file, giving you full
control.

The config is easy to read and understand, and has full auto-complete for supported editors. Plugins can have their own config options that you can pass, even having auto-complete support there too.

> Check out the [configuration](https://hindenburg.js.org/pages/getting-started/configuration/index.html) guide for more information.

> Hindenburg also supports some environment variables to fine-tune where Hindenburg looks for your config and plugins, see the [environment variables](https://hindenburg.js.org/pages/getting-started/configuration/environment-variables.html) guide.

The config is live updating, meaning that any changes in your config are _instantly_ reflected in the server and plugins.

It allows you to choose completely how the server behaves, even down to the exact way that clients, rooms and players are logged in the console, allowing you to see whatever information that you need.

![plugins](https://github.com/SkeldJS/Hindenburg/raw/master/media/plugins.png)

Leveraging the power of SkeldJS, Hindenburg has full knowledge of running games,
giving you a sophisticated and powerful plugin API.

Plugins are easy to install, easy to configure and easy to create.

> If you're a server owner, check out the guide on [setting up plugins](https://hindenburg.js.org/pages/getting-started/using-hindenburg/installing-plugins.html). Documentation can be found [here](https://hindenburg.js.org/index.html).

> If you're looking to develop your own plugin, checkout the guide on [writing your own plugins](https://hindenburg.js.org/pages/plugins/creating-a-plugin.html). Check out the [custom game code](https://github.com/SkeldJS/hbplugin-customgamecode) plugin for an example.

Hindenburg even supports hot plugin reloading, making it more developer-friendly than an alternative such as Impostor, and allowing you to reload your server plugins without downtime.

> Check out a [full, completely unbiased comparison](https://hindenburg.js.org/pages/getting-started/comparison-with-impostor.html).

Plugins can be attached either directly to the server covering all rooms and server behaviour, or isolated on individual rooms.

> Learn more about the difference [here](https://hindenburg.js.org/pages/plugins/worker-and-room-plugins.html).

Plugins are great for adding first-class support for client mods to Hindenburg, even allowing you to extend Server-as-a-Host capabilities, allowing you to move your client-side logic to the server, ensuring security and source integrity.

![reactor support](https://github.com/SkeldJS/Hindenburg/raw/master/media/reactor-support.png)
Hindenburg has official plugin support for clients using [Reactor](https://reactor.gg), allowing plugins to communicate directly with client-side mods and giving you the ability to leverage the full potential of the Reactor protocol.

With the ability to ban, require or require specific versions of mods, you can be sure that clients are connecting to your servers with the _exact_ mods that your modpack requires.

> Check out the page on [Reactor support](https://hindenburg.js.org/pages/getting-started/configuration/reactor-support.html) for more information.

Combined with Hindenburg's [Server-as-a-Host](https://hindenburg.js.org/pages/getting-started/using-hindenburg/server-as-a-host.html) technology and excellent plugin support, the full stack of Hindenburg _and_ Reactor is certain to create a great experience for players, server owners and plugin developers all-round.

## Issues
For issues regarding bugs that you encounter while using Hindenburg, please create
an issue on the [github issues](https://github.com/skeldjs/Hindenburg/issues) page.

For help setting Hindenburg up, writing plugins or just general questions, please
check out the [Discord server](#discord-server)

#### Notes
Hindenburg is licensed under the [GNU General Public License v3.0](https://choosealicense.com/licenses/lgpl-3.0/),
meaning I am not responsible for anything you do with this library.
