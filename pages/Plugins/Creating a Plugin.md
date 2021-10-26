### Prerequisites
You should generally have some knowledge of what you're doing when writing a plugin, and while you will get as much help as possible on the [Discord server](https://discord.gg/8ewNJYmYAU), it's unlikely that anyone will want to spoonfeed you.

The main 2 supported editors are [VSCode](https://code.visualstudio.com/) and [JetBrains' WebStorm](https://www.jetbrains.com/webstorm/), although any javascript editor will likely work, for example [Atom](https://atom.io/).

### Create plugin template
Hindenburg can quickly generate a plugin template with the `yarn plugins create` command, and gives you some simple configuration questions:

![gif](https://user-images.githubusercontent.com/60631511/137995085-1be604c0-b384-4031-b972-f41b5bad97fa.gif)

> You can change where plugins are created with the {@page Environment Variables | `HINDENBURG_PLUGINS`} environment variable.

#### [TypeScript](https://typescriptlang.org)
It is highly recommended to use TypeScript in your plugins. Both skeldjs and Hindenburg are built with TypeScript in mind, and while it is possible to use JavaScript, you will not have nearly the same developer experience with the types and information that Typescript can provide you.

#### [Yarn](https://yarnpkg.com)
Not as necessary as TypeScript, but is generally recommended just because "it's better than npm". It's helpful to have a consistent package manager across similar projects, therefore it's probably best to use yarn to remain consistent with Hindenburg.

#### [Git](https://git-scm.org)
Probably best to use Git if you plan on publishing your plugin, especially if you also plan on making it open source. This makes it much easier to manage, find your plugin later & for users to be able to find your source code.

#### Plugin Type
Hindenburg has 2 types of plugins, Worker plugins and Room plugins. Worker plugins are global across all rooms, while Room plugins are instantiated per room and are scoped, only receiving events from that specific room.
