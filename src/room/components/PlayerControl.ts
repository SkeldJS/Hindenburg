import {
    BaseRpcMessage,
    RpcMessage,
    SendChatMessage,
    SetColorMessage,
    SetNameMessage
} from "@skeldjs/protocol";

import { HazelReader, HazelWriter } from "@skeldjs/util";
import { Color, RpcMessageTag } from "@skeldjs/constant";

import { Component } from "../Component";
import { Player } from "../Player";
import { Room } from "../Room";

import {
    PlayerChatEvent,
    PlayerSetColorEvent,
    PlayerSetNameEvent
} from "../events";

export class PlayerControl implements Component {
    constructor(
        public readonly room: Room,
        public readonly owner: Player,
        public readonly netid: number
    ) {}
    
    Deserialize(reader: HazelReader, isSpawn: boolean) {
        if (isSpawn) {
            reader.bool(); // Skip isNew
        }
        const playerId = this.owner.playerId;
        this.owner.playerId = reader.uint8();
        if (playerId !== this.owner.playerId) {
            this.room.players.playerIds.delete(playerId);
            this.room.players.playerIds.set(this.owner.playerId, this.owner);
        }
    }

    Serialize(writer: HazelWriter, isSpawn: boolean) {
        if (isSpawn) {
            writer.bool(true);
        }
        writer.uint8(this.owner.playerId);
        return isSpawn;
    }

    async HandleRpc(message: BaseRpcMessage) {
        switch (message.tag) {
            case RpcMessageTag.SetName:
                await this._handleSetName(message as SetNameMessage);
                break;
            case RpcMessageTag.SetColor:
                await this._handleSetColor(message as SetColorMessage);
                break;
            case RpcMessageTag.SendChat:
                await this._handleSendChat(message as SendChatMessage);
                break;
        }
    }

    private async _handleSetName(message: SetNameMessage) {
        const oldName = this.owner.info?.name;

        this._setName(message.name);
        const ev = await this.owner.emit(
            new PlayerSetNameEvent(
                this.room,
                this.owner,
                message,
                oldName || "",
                message.name
            )
        );

        if (ev.reverted) {
            this._setName(oldName || "");
            this.rpcSetName(ev.alteredName);
            return;
        }

        if (ev.alteredName !== message.name) {
            this._setName(ev.alteredName);
            this.rpcSetName(ev.alteredName);
        }
    }

    private _setName(name: string) {
        if (this.owner.info)
            this.owner.info.name = name;
    }

    rpcSetName(name: string) {
        this.room.gamedataStream.push(
            new RpcMessage(
                this.netid,
                new SetNameMessage(
                    name
                )
            )
        );
    }

    private async _handleSetColor(message: SetColorMessage) {
        const oldColor = this.owner.info?.color;

        this._setColor(message.color);
        const ev = await this.owner.emit(
            new PlayerSetColorEvent(
                this.room,
                this.owner,
                message,
                oldColor || -1,
                message.color
            )
        );

        if (ev.reverted) {
            this._setColor(oldColor || -1);
            this.rpcSetColor(ev.alteredColor);
            return;
        }

        if (ev.alteredColor !== message.color) {
            this._setColor(ev.alteredColor);
            this.rpcSetColor(ev.alteredColor);
        }
    }

    private _setColor(name: Color) {
        if (this.owner.info)
            this.owner.info.color = name;
    }

    rpcSetColor(color: Color) {
        this.room.gamedataStream.push(
            new RpcMessage(
                this.netid,
                new SetColorMessage(
                    color
                )
            )
        );
    }

    private async _handleSendChat(message: SendChatMessage) {
        await this.owner.emit(
            new PlayerChatEvent(
                this.room,
                this.owner,
                message,
                message.message
            )
        );
    }
}