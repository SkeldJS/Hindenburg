# Installing
We recommend doing this on a VPS, or if you don't have one, you *can* use your PC to do it *but* you'll need to do port forwarding to let people outside of your home network join your server.

Feel free to join the discord if you're having trouble installing Hindenburg.
Invite: https://discord.gg/8ewNJYmYAU.

## Redis
To install Hindenburg, you must first install [*Redis*](https://redis.io)<sup>[*1*](Installing.md#notes)</sup>. See below for instructions to do so.

### Arch-based distros
The following commands should install and start the redis server service:
```
sudo pacman -S redis

sudo systemctl enable redis.service

sudo systemctl start redis.service
```

### Ubuntu/Debian
The following commands should install and start the redis server service:
```
sudo apt-get install redis-server

sudo systemctl enable redis-server.service

sudo systemctl start redis-server.service
```

### Windows or MacOS Docker
Although Redis does not support Windows natively, there are some workarounds.

The first workaround is to use **Docker**, which lets you run applications that have
been "containerized" to run on a standardised machine by virtualising the
operating system that the application runs on.

To install Docker on Windows, follow the steps on this page: https://docs.docker.com/docker-for-windows/install/#install-docker-desktop-on-windows.

Also, remember to start Docker. (See https://docs.docker.com/docker-for-windows/install/#install-docker-desktop-on-windows)

You can then use `sudo docker run --name hindenburg-redis -d redis` to start
the redis container.

### Windows WSl2
The other workaround, is to install the **Windows Subsystem for Linux 2 (WSL2)**.

To install and start WSl2, follow the steps on this page: https://docs.microsoft.com/en-us/windows/wsl/install-win10

You can then follow the steps [above](#arch-based-distros) to install and start
Redis on your WSL2 machine.

## Yarn/Node
Now that we've installed [*Redis*](https://redis.io), we can move on to installing yarn and node, other requirements for Hindenburg (installing yarn installs nodejs by default)

### Arch-based distros

```
sudo pacman -S yarn
````

### Debian-based distros

```
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -

echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list

sudo apt update

sudo apt install yarn
```

### Windows

First download and install nodejs from https://nodejs.org.

Then to install yarn, use https://classic.yarnpkg.com/latest.msi which goes directly
to a `.msi` download. Alternatively you can install through `npm` (Comes installed with nodejs)
with `npm install -g yarn`

Make sure you also have git installed at https://git-scm.org

## Installing Hindenburg

```
git clone https://github.com/edqx/Hindenburg/

yarn build

yarn start:load-balancer
```

For running the first time without a config, Hindenburg will auto-generate
a default config for you, although for more advanced customisation you can open
the file in a text editor of your choice. See https://github.com/edqx/Hindenburg/blob/master/docs/Configuration.md
for config documentation.

If you are hosting the server on a public VPS, it's likely that you will need to
change the ip addresses in the config to `auto` to automatically discover your server's
public ip address and use that.

## Connecting

### Windows

Go to `\AppData\LocalLow\Innersloth\Among Us` to locate your `regionInfo.json` file.

A quick way to do this:
* Press `Win+R` to open the run menu.
* Enter `%USERPROFILE%\AppData\LocalLow\Innersloth\Among Us\` in the box and hit enter.

Open the `regionInfo.json` file with your favourite text editor. Change the contents to this:
```json
{
  "CurrentRegionIdx": 7,
  "Regions": [
    {
      "$type": "DnsRegionInfo, Assembly-CSharp",
      "Fqdn": "na.mm.among.us",
      "DefaultIp": "50.116.1.42",
      "Port": 22023,
      "Name": "North America",
      "TranslateName": 289
    },
    {
      "$type": "DnsRegionInfo, Assembly-CSharp",
      "Fqdn": "eu.mm.among.us",
      "DefaultIp": "172.105.251.170",
      "Port": 22023,
      "Name": "Europe",
      "TranslateName": 290
    },
    {
      "$type": "DnsRegionInfo, Assembly-CSharp",
      "Fqdn": "as.mm.among.us",
      "DefaultIp": "139.162.111.196",
      "Port": 22023,
      "Name": "Asia",
      "TranslateName": 291
    },
    {
      "$type": "DnsRegionInfo, Assembly-CSharp",
      "Fqdn": "<your vps/pc ip>",
      "DefaultIp": "<your vps/pc ip>",
      "Port": 22023,
      "Name": "My Server",
      "TranslateName": 1003
    }
  ]
}
```
Remember to change the `<your vps/pc ip>` section in the `regionInfo.json`
(Re)start Among Us, hit Online, and then the globe in the bottom right. Press the `Your Server` button or whatever you named it to in the `regionInfo.json`.
## Notes
<sup>1.</sup> Redis does not natively support windows, although there are workarounds documented above.