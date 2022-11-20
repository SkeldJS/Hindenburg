You can publish your plugins either directly to the [NPM](https://npmjs.com) package registry, or you can just upload your source to GitHub to require server owners to install your plugin directly and manually.

> If you're looking to _install_ plugins, check out the page on [Installing Plugins](../Getting%20Started/Installing%20Plugins.html).

## Publishing to NPM
If you want to publish to NPM, make sure the plugin's package name begins with `hbplugin-` to make it identifiable and searchable. You can use the following command to publish it via yarn:
```sh
yarn publish
```

> Make sure you're logged into NPM with `yarn npm login`

Make sure to only publish _working hindenburg plugins_ under a `hbplugin-` namespace, as Hindenburg will otherwise refuse to load them.

## Publishing to GitHub
If you want to publish to GitHub, you can simply create a GitHub repo and push your changes to that.

> When creating your plugin, make sure to enable Git if you plan to publish your plugin to GitHub.

> Stuck on this? Check out the [GitHub docs](https://docs.github.com/en/get-started/quickstart/create-a-repo) for more information.

You can push your changes with the following commands:
```sh
git remote add origin <github repo link>
```

```sh
git add .
git commit -m "Some changes"
git push origin master
```
