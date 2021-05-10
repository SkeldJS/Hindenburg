### WIP
Hindenburg is currently not in a particularly usable state, so it's recommended not to use it right now.

# Hindenburg
Hindenburg is a completely customisable, performant and scalable Among Us server, complete with plugins and a sophisticated and configurable anti-cheat.

It uses [SkeldJS](https://github.com/SkeldJS/SkeldJS) to interface with the Among Us protocol, as well as keeping state.

## Starting
Hindenburg has both a load balancer and individual node servers.

If you are running for the first time and are yet to add a config file, run `yarn serve:load-balancer` to write the default one.

### Load Balancer
If the current server is running as a load balancer,

The node servers do not need to be aware of the load balancer and they do not need to be aware of each other,
however the load balancer must be aware of each node in the system.

The load balancer IP being the IP address of the server that the load server is running on, and
each node IP being the IP address of the server that that node is running on.

### Cluster
If the current server is running as a node cluster, you will have to configure the IP and
ports to use.

The cluster IP being the IP address of the server that the cluster is running on.

### Running
In a development environment, you can run both
`yarn serve:load-balancer` and `yarn serve:cluster` to run the load balancer and the cluster
respectively. 

In a production environment, you can run both
`yarn start:load-balancer` and `yarn start:cluster` to run the load balacner and the cluster
respectively. You can use a tool like [pm2](https://npmjs.com/package/pm2) to run these
concurrently and keep them both alive in case of crashes. Make sure that you run `yarn build`
beforehand.