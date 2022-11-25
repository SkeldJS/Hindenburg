import { GameData, PlayerControl, PlayerInfo, PlayerOutfitType, RpcMessageTag } from "@skeldjs/core";
import {
    DataMessage,
    RpcMessage
} from "@skeldjs/protocol";

import { HazelReader, HazelWriter } from "@skeldjs/util";
import { PacketContext, Perspective } from "../../../worker";
import { MessageFilter, MessageFilterDirection } from "../../hooks";
import { PerspectiveFilter } from "../PerspectiveFilter";

/**
 * An enum for bitfield values to select what to allow/disallow for the {@link PlayerUpdatesPerspectiveFilter}
 * with {@link Perspective}s.
 *
 * @example
 * ```ts
 * const perspectiveFilter = new PlayerInfoPerspectiveFilter;
 *
 * const perspective = room.createPerspective(player);
 * perspective.applyFilter(MessageFilterDirection.Incoming, perspectiveFilter);
 *
 * // allow all player info except flags
 * perspective.setAllPlayerInfoAllowed(player.playerId);
 * perspective.unsetPlayerInfoAllowed(player.playerId, PlayerInfoGuard.Flags);
 * ```
 */
export enum PlayerUpdatesFilterFlag {
    /**
     * Allow a player's name to be synced in a perspective.
     */
    Name = 1 << 0,
    /**
     * Allow a player's colour to be synced in a perspective.
     */
    Color = 1 << 1,
    /**
     * Allow a player's hat to be synced in a perspective.
     */
    Hat = 1 << 2,
    /**
     * Allow a player's skin to be synced in a perspective.
     */
    Skin = 1 << 3,
    /**
     * Allow a player's pet to be synced in a perspective.
     */
    Pet = 1 << 4,
    /**
     * Allow a player's visor to be synced in a perspective.
     */
    Visor = 1 << 5,
    /**
     * Allow a player's nameplate to be synced in a perspective.
     */
    Nameplate = 1 << 6,
    /**
     * Allow a player's alive or dead state to be synced in a perspective.
     */
    Dead = 1 << 7,
    /**
     * Allow a player's disconnected state to be synced in a perspective.
     */
    Disconnected = 1 << 8,
    /**
     * Allow a player's impostor state to be synced in a perspective.
     */
    Impostor = 1 << 9,
    /**
     * Combines {@link PlayerUpdatesFilterFlag.Dead}, {@link PlayerUpdatesFilterFlag.Disconnected}
     * and {@link PlayerUpdatesFilterFlag.Impostor}.
     *
     * More often than not, this'll be used to prevent player's cosmetics from
     * synced whille preventing the game from having issues where players would
     * be dead or disconnected in one perspective but alive in another.
     *
     * @example
     * ```ts
     * perspective.setAllPlayerInfoAllowed(player.playerId);
     * perspective.unsetPlayerInfoAllowed(player.playerId, PlayerInfoGuard.Flags);
     * ```
     */
    Flags = PlayerUpdatesFilterFlag.Dead | PlayerUpdatesFilterFlag.Disconnected | PlayerUpdatesFilterFlag.Impostor
}

/**
 * A perspective filter used to prevent information about players from being synced
 * .
 * Information includes cosmetics like names, colours, flags, pets, etc. but also
 * invisible "state" things such as tasks, whether or not the player is dead, disconnected,
 * an impostor, etc.
 *
 * This filter is especially useful for gamemodes with custom roles, where the roles
 * can be identified with cosmetics that other players shouldn't be able to see.
 *
 * It's built around "allowing" or "disallowing" certain flags for each player. For example,
 * you might use this filter to block cosmetics from being synced, but allow state
 * such as the player being dead or disconnected to sync.
 */
export class PlayerUpdatesPerspectiveFilter extends PerspectiveFilter {
    protected _defaultAllowed: number;
    protected _playerInfoAllowed: Map<number, number>;

    constructor() {
        super();

        this._defaultAllowed = 0;
        this._playerInfoAllowed = new Map;
    }

    /**
     * Create a global rule for all players to allow some player update flag to sync/pass through.
     * @param guardBitfield A bitfield of {@link PlayerUpdatesFilterFlag}s to allow to sync/pass through.
     * @example
     * ```ts
     * playerUpdatesFilter.setAllowed(PlayerUpdatesFilterFlag.Flags | PlayerUpdatesFilterFlag.Color);
     * ```
     */
    setAllowed(guardBitfield: number) {
        this._defaultAllowed |= guardBitfield;
    }

    /**
     * Remove a global rule for all players to prevent some player update flag from being synced/passed through.
     *
     * Note that this does not override player rules created with {@link PlayerUpdatesPerspectiveFilter.setPlayerInfoAllowed}.
     * @param guardBitfield A bitfiedl of {@link PlayerUpdatesFilterFlag}s to prevent from being synced/passed through.
     * @example
     * ```ts
     * playerUpdatesFilter.setAllAllowed();
     *
     * playerUpdatesFilter.unsetAllowed(PlayerUpdatesFilterFlag.Name);
     * ```
     */
    unsetAllowed(guardBitfield: number) {
        this._defaultAllowed &= ~guardBitfield;
    }

    /**
     * Create a rule to allow all updates for players to be synced/passed through.
     *
     * Note that on its own, this is equivalent to having no player update perspective filter at all,
     * so more often than not it will be used as a disable/enable toggle or in conjunction
     * with {@link PlayerUpdatesPerspectiveFilter.unsetAllowed}.
     * @example
     * ```ts
     * playerUpdatesFilter.setAllAllowed();
     *
     * playerUpdatesFilter.unsetAllowed(PlayerUpdatesFilterFlag.Name);
     * ```
     */
    setAllAllowed() {
        this._defaultAllowed = 0xfff;
    }

    /**
     * Create a rule to prevent all updates for players from being synced/passed through.
     * @example
     * ```ts
     * playerUpdatesFilter.unsetAllAllowed();
     * ```
     */
    unsetAllAllowed() {
        return this.unsetAllowed(0xfff);
    }

    /**
     * Get the bitfield that covers rules for updates for all players.
     */
    getAllowed() {
        return this._defaultAllowed;
    }

    /**
     * Get the bitfield that covers rules for updates for a specific player's player id.
     * @param playerId The ID of the player to get rules for.
    */
    getPlayerInfoAllowed(playerId: number) {
        const cachedAllowGuards = this._playerInfoAllowed.get(playerId);
        return cachedAllowGuards || 0;
    }

    setPlayerInfoAllowed(playerId: number, guardBitfield: number) {
        const playerInfoAllowed = this.getPlayerInfoAllowed(playerId);
        this._playerInfoAllowed.set(playerId, playerInfoAllowed | guardBitfield);
        return playerInfoAllowed;
    }

    unsetPlayerInfoAllowed(playerId: number, guardBitfield: number) {
        const playerInfoAllowed = this.getPlayerInfoAllowed(playerId);
        this._playerInfoAllowed.set(playerId, playerInfoAllowed & ~guardBitfield);
        return playerInfoAllowed;
    }

    setAllPlayerInfoAllowed(playerId: number) {
        return this.setPlayerInfoAllowed(playerId, 0xfff);
    }

    unsetAllPlayerInfoAllowed(playerId: number) {
        return this.unsetPlayerInfoAllowed(playerId, 0xfff);
    }

    calculatePlayerInfoAllowed(playerId: number) {
        const playerInfoAllowed = this.getPlayerInfoAllowed(playerId);

        return playerInfoAllowed | this._defaultAllowed;
    }

    protected _applyAllowedInfo(allowedBitfield: number, srcPlayerInfo: PlayerInfo, destPlayerInfo: PlayerInfo) {
        if ((allowedBitfield & PlayerUpdatesFilterFlag.Name) > 0) destPlayerInfo.setName(PlayerOutfitType.Default, srcPlayerInfo.defaultOutfit.name);
        if ((allowedBitfield & PlayerUpdatesFilterFlag.Color) > 0) destPlayerInfo.setColor(PlayerOutfitType.Default, srcPlayerInfo.defaultOutfit.color);
        if ((allowedBitfield & PlayerUpdatesFilterFlag.Hat) > 0) destPlayerInfo.setHat(PlayerOutfitType.Default, srcPlayerInfo.defaultOutfit.hatId);
        if ((allowedBitfield & PlayerUpdatesFilterFlag.Skin) > 0) destPlayerInfo.setSkin(PlayerOutfitType.Default, srcPlayerInfo.defaultOutfit.skinId);
        if ((allowedBitfield & PlayerUpdatesFilterFlag.Pet) > 0) destPlayerInfo.setPet(PlayerOutfitType.Default, srcPlayerInfo.defaultOutfit.petId);
        if ((allowedBitfield & PlayerUpdatesFilterFlag.Visor) > 0) destPlayerInfo.setVisor(PlayerOutfitType.Default, srcPlayerInfo.defaultOutfit.visorId);
        if ((allowedBitfield & PlayerUpdatesFilterFlag.Nameplate) > 0) destPlayerInfo.setNameplate(PlayerOutfitType.Default, srcPlayerInfo.defaultOutfit.nameplateId);
        if ((allowedBitfield & PlayerUpdatesFilterFlag.Dead) > 0) destPlayerInfo.setDead(srcPlayerInfo.isDead);
        if ((allowedBitfield & PlayerUpdatesFilterFlag.Disconnected) > 0) destPlayerInfo.setDisconnected(srcPlayerInfo.isDisconnected);
        if ((allowedBitfield & PlayerUpdatesFilterFlag.Impostor) > 0) destPlayerInfo.setImpostor(srcPlayerInfo.isImpostor);
    }

    @MessageFilter(DataMessage)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected _onDataMessage(message: DataMessage, perspective: Perspective, direction: MessageFilterDirection, context: PacketContext) {
        const netObject = perspective.netobjects.get(message.netId);

        if (!(netObject instanceof GameData))
            return;

        const updatedPlayerIds = [];
        const reader = HazelReader.from(message.data);
        while (reader.left) {
            const [ playerId ] = reader.message();
            updatedPlayerIds.push(playerId);
        }
        if (perspective.gameData && perspective.parentRoom.gameData) {
            if (direction === MessageFilterDirection.Incoming) {
                for (const updatedPlayerId of updatedPlayerIds) {
                    const playerInfoAllowed = this.calculatePlayerInfoAllowed(updatedPlayerId);

                    if (!playerInfoAllowed)
                        continue;

                    const destPlayerInfo = perspective.gameData.players.get(updatedPlayerId);
                    const srcPlayerInfo = perspective.parentRoom.gameData.players.get(updatedPlayerId);

                    if (!srcPlayerInfo || !destPlayerInfo)
                        continue;

                    this._applyAllowedInfo(playerInfoAllowed, srcPlayerInfo, destPlayerInfo);
                }

                perspective.gameData.PreSerialize();
                const writer = HazelWriter.alloc(1024);
                if (perspective.gameData.Serialize(writer, false)) {
                    writer.realloc(writer.cursor);
                    const dataMessage = new DataMessage(perspective.gameData.netId, writer.buffer);
                    perspective.messageNonce.add(dataMessage);
                    perspective.messageStream.push(dataMessage);
                }
                perspective.gameData.dirtyBit = 0;
            } else if (direction === MessageFilterDirection.Outgoing) {
                for (const updatedPlayerId of updatedPlayerIds) {
                    const playerInfoAllowed = this.calculatePlayerInfoAllowed(updatedPlayerId);

                    if (!playerInfoAllowed)
                        continue;

                    const srcPlayerInfo = perspective.gameData.players.get(updatedPlayerId);
                    const destPlayerInfo = perspective.parentRoom.gameData.players.get(updatedPlayerId);

                    if (!srcPlayerInfo ||  !destPlayerInfo)
                        continue;

                    this._applyAllowedInfo(playerInfoAllowed, srcPlayerInfo, destPlayerInfo);
                }

                perspective.parentRoom.gameData.PreSerialize();
                const writer = HazelWriter.alloc(1024);
                if (perspective.parentRoom.gameData.Serialize(writer, false)) {
                    writer.realloc(writer.cursor);
                    const dataMessage = new DataMessage(perspective.parentRoom.gameData.netId, writer.buffer);
                    perspective.messageNonce.add(dataMessage);
                    perspective.parentRoom.messageStream.push(dataMessage);
                }
                perspective.parentRoom.gameData.dirtyBit = 0;
            }
        }
    }

    @MessageFilter(RpcMessage)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected _onCosmeticRpc(message: RpcMessage, perspective: Perspective, _direction: MessageFilterDirection, _context: PacketContext) {
        if (
            message.data.messageTag === RpcMessageTag.SetName ||
            message.data.messageTag === RpcMessageTag.SetColor ||
            message.data.messageTag === RpcMessageTag.SetHat ||
            message.data.messageTag === RpcMessageTag.SetSkin ||
            message.data.messageTag === RpcMessageTag.SetPet ||
            message.data.messageTag === RpcMessageTag.SetVisor ||
            message.data.messageTag === RpcMessageTag.SetNameplate
        ) {
            const component = perspective.netobjects.get(message.netId);

            if (component instanceof PlayerControl) {
                const playerId = component.playerId;
                const playerInfoAllowed = this.calculatePlayerInfoAllowed(playerId);

                if (!playerInfoAllowed)
                    return;

                switch (message.data.messageTag) {
                case RpcMessageTag.SetName: if ((playerInfoAllowed & PlayerUpdatesFilterFlag.Name) === 0) message.cancel(); break;
                case RpcMessageTag.SetColor: if ((playerInfoAllowed & PlayerUpdatesFilterFlag.Color) === 0) message.cancel(); break;
                case RpcMessageTag.SetHat: if ((playerInfoAllowed & PlayerUpdatesFilterFlag.Hat) === 0) message.cancel(); break;
                case RpcMessageTag.SetSkin: if ((playerInfoAllowed & PlayerUpdatesFilterFlag.Skin) === 0) message.cancel(); break;
                case RpcMessageTag.SetPet: if ((playerInfoAllowed & PlayerUpdatesFilterFlag.Pet) === 0) message.cancel(); break;
                case RpcMessageTag.SetVisor: if ((playerInfoAllowed & PlayerUpdatesFilterFlag.Visor) === 0) message.cancel(); break;
                case RpcMessageTag.SetNameplate: if ((playerInfoAllowed & PlayerUpdatesFilterFlag.Nameplate) === 0) message.cancel(); break;
                }
            }
        }
    }
}
