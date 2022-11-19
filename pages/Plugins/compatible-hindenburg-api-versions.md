You can set which versions of Hindenburg that your plugin is compatible with in your plugin's `package.json`:

```json
{
    "engines": {
        "node": ">=14",
        "hindenburg": "1.1.*"
    }
}
```

> Note that this is _not_ the same syntax used in the `"node"` entry above. Instead, it will accept a [glob pattern](https://en.wikipedia.org/wiki/Glob_(programming)).

This allows you to specify exactly which versions of Hindenburg will work with your plugin.

By default, if you're using the {@page ./creating-a-plugin.md template creator} script, this will be set to whichever version of Hindenburg you're currently running with the last segment (the [patch](https://semver.org/) version) replaced with a wildcard `*`. This runs under the assumption that Hindenburg's API should remainly relatively stable throughout each patch, whereas it might change more drastically between each minor update.

## Specific Versions
If you know _exactly_ which versions of Hindenburg your plugin supports, you can get creative with the glob pattern:

```json
{
    "engines": {
        "node": ">=14",
        "hindenburg": "1.@(1|2).*"
    }
}
```

> Check out this [extended glob syntax guide](https://www.linuxjournal.com/content/bash-extended-globbing) for more information on how to write a glob pattern.

## All Versions
If you wish to accept _all_ versions of Hindenburg, or you're lazy at maintaining your plugins, then you can either remove `"hindenburg"` from the `engines` object, or, replace the version with a wildcard `*`:

```json
{
    "engines": {
        "node": ">=14",
        "hindenburg": "*"
    }
}
```
