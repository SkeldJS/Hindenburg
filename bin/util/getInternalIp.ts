import net from "net";

export function getInternalIp() {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(80, "api.ipify.org");
        socket.on("connect", function() {
            resolve((socket.address() as any).address);
            socket.end();
        });
        socket.on("error", function(e) {
            reject(e);
            socket.end();
        });
    });
}