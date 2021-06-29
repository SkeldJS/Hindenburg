import { PlayerSetNameEvent } from "@skeldjs/core";
import {
    HindenburgPlugin,
    Plugin,
    ChatCommand,
    EventListener,
    Lobby,
    ChatCommandContext
} from "../../src";

@HindenburgPlugin({
    id: "hbplugin-someplugin",
    version: "1.0.0",
    order: "none"
})
export default class extends Plugin {
    @ChatCommand("lsobj", "List all objects in the game.")
    async onLsObj(ctx: ChatCommandContext, args: any) {
        const lines = [];
        for (const [ netid, component ] of ctx.lobby.room.netobjects) {
            lines.push(netid + " - " + component.classname);
        }
        ctx.reply(lines.join("\n"));
    }

    @ChatCommand("despawn <netid>", "Despawn an object by its netid.")
    async onDespawn(ctx: ChatCommandContext, args: any) {
        const netid = parseInt(args.netid);
        const component = ctx.lobby.room.netobjects.get(netid);

        if (!component) {
            return ctx.reply("There is no component with netid '" + args.netid + "'");
        }

        component.despawn();
    }

    @EventListener("player.setname")
    onSetName(ev: PlayerSetNameEvent<Lobby>) {
        ev.room.sendChat("you have set your name to " + ev.newName, { target: ev.player });
    }
}