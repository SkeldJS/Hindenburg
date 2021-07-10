# Installing Hindenburg
## Via GitHub
### Prerequisites
* [Git](https://git-scm.org)
* [Node.js](https://nodejs.org)
* [NPM](https://npmjs.com) (Comes installed with Node.js)

```sh
# Install yarn via npm
npm install -g yarn
# Copy source code to your computer
git clone https://github.com/Skeldjs/Hindenburg
cd Hindenburg
# Install dependencies and setup Hindenburg
yarn
yarn setup
# Use `yarn dev` instead to skip this step
yarn build
yarn start
```

## Via Docker (to come)
### Prerequisites
* [Docker](https://docker.com)
```
docker run -p 22023:22023 skeldjs/hindenburg
```

## Notes
Join the discord if you're having issues installing, or have any questions:
https://discord.gg/8ewNJYmYAU