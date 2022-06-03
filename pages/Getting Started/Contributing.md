## Using a Local Version of SkeldJS
If you're developing both Hindenburg and SkeldJS simultaneously, i.e. developing updates for SkeldJS for use in Hindenburg, you can leverage yarn's [dependency protocols](https://yarnpkg.com/features/protocols) in order to link SkeldJS:

```json
/// hindenburg/package.json
...
"dependencies": {
    "@skeldjs/client": "link:../SkeldJS/packages/client",
    "@skeldjs/constant": "link:../SkeldJS/packages/constant",
    "@skeldjs/core": "link:../SkeldJS/packages/client",
    "@skeldjs/data": "link:../SkeldJS/packages/data",
    "@skeldjs/events": "link:../SkeldJS/packages/events",
    "@skeldjs/protocol": "link:../SkeldJS/packages/protocol",
    "@skeldjs/reactor": "link:../SkeldJS/packages/reactor",
    "@skeldjs/state": "link:../SkeldJS/packages/state",
    "@skeldjs/text": "link:../SkeldJS/packages/text",
    "@skeldjs/util": "link:../SkeldJS/packages/util",
    ...
```

> Remember not to stage your updated package.json changes before committing.

Note that you'll have to build if you make any changes made to the SkeldJS packages.