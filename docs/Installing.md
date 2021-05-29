# Installing
We recommend doing this on a VPS, or if you don't have one, you *can* use your PC to do it *but* you'll need to do port forwarding to let people outside of your home network join your server
## Redis
To install Hindenburg, you must first install [*Redis*](https://redis.io)<sup>[*1*](Installing.md#notes)</sup>. See below for instructions to do so.

### Arch-based distros
`sudo pacman -S redis`

`sudo systemctl enable redis.service`

`sudo systemctl start redis.service`

### Ubuntu/Debian
`sudo apt-get install redis-server`

`sudo systemctl enable redis-server.service`

`sudo systemctl start redis-server.service`

## Yarn/Node
Now that we've installed [*Redis*](https://redis.io), we can move on to installing yarn and node, other requirements for Hindenburg (installing yarn installs nodejs by default)

### Arch-based distros

`sudo pacman -S yarn`

### Debian-based distros

`curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -`

`echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list`

`sudo apt update`

`sudo apt install yarn`

## Installing Hindenburg

`git clone https://github.com/edqx/Hindenburg/`

`yarn build`

`yarn start:load-balancer`

Now it should say it's generated the config, we need to edit this, we're going to open this file using `nano`

`nano config.json`
Go to the `loadbalancer` section and change where it says `127.0.0.1` to your vps's (or pc's, if your're using your PC to do this) ip address. Change the `reactor` field to `true` if you wish to use reactor on this server. Do Ctrl+O then hit enter, then hit Ctrl+X to exit `nano`. Open a second terminal and then do
`yarn start:load-balancer`
in the first one and 
`yarn start:cluster`
in the second one.

## Connecting

Go to your Windows PC that you are trying to connect to the server on. Then press `Win+R` and enter `%USERPROFILE%\AppData\LocalLow\Innersloth\Among Us\` in the box and hit enter. Open the `regionInfo.json` file with your favourite text editor. I personally use Notepad++, but you can use what ever you want. Change the contents to this:
```json
{"CurrentRegionIdx":7,"Regions":[{"$type":"DnsRegionInfo, Assembly-CSharp","Fqdn":"na.mm.among.us","DefaultIp":"50.116.1.42","Port":22023,"Name":"North America","TranslateName":289},{"$type":"DnsRegionInfo, Assembly-CSharp","Fqdn":"eu.mm.among.us","DefaultIp":"172.105.251.170","Port":22023,"Name":"Europe","TranslateName":290},{"$type":"DnsRegionInfo, Assembly-CSharp","Fqdn":"as.mm.among.us","DefaultIp":"139.162.111.196","Port":22023,"Name":"Asia","TranslateName":291},{"$type":"DnsRegionInfo, Assembly-CSharp","Fqdn":"192.99.166.97","DefaultIp":"<your vps/pc ip>","Port":22023,"Name":"My Server","TranslateName":1003}]}
```
Remember to change the `<your vps/pc ip>` section in the `regionInfo.json`
(Re)start Among Us, hit Online, and then the globe in the bottom right. Press the `Your Server` button or whatever you named it to in the `regionInfo.json`. You can now play on your very own Hindenburg server! Enjoy! 
## Notes
<sup>1.</sup> Redis has no windows or mac support
