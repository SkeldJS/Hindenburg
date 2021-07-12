# Publishing Plugins to NPM
There are a few things to keep in mind when writing and publishing plugins
to NPM:
* Try to keep dependencies at a minimum.
* Only publish plugins if there's a relative need. - It's no good having 2 plugins
that do almost the exact same thing.
* Plugin names should begin with `hbplugin-`. This is to keep them easily recognisable,
searchable, and easier to install.
* Make sure to build plugins before publishing them.
* Publish the absolute minimum number of files. - Ideally just the `package.json`
and the built files, i.e. a `dist` directory. You can do this with the `"files": []`
property in the `package.json`.