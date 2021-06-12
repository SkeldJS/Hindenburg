import { SpawnType } from "@skeldjs/constant";
import { Component } from "../Component";
import { CustomNetworkTransform } from "../components/CustomNetworkTransform";
import { GameData } from "../components/GameData";
import { PlayerControl } from "../components/PlayerControl";
import { PlayerPhysics } from "../components/PlayerPhysics";
import { VoteBanSystem } from "../components/VoteBanSystem";
import { Player } from "../Player";
import { Room } from "../Room";

export class ComponentStore extends Map<number, Component> {
    gameData?: GameData;
    voteBanSystem?: VoteBanSystem;

    constructor(
        public readonly room: Room
    ) {
        super();
    }

    addComponent(spawnType: SpawnType, idx: number, component: Component) {
        if (spawnType === SpawnType.GameData) {
            switch (idx) {
            case 0:
                this.gameData = component as GameData;
                break;
            case 1:
                this.voteBanSystem = component as VoteBanSystem;
                break;
            }
        }
        if (spawnType === SpawnType.Player) {
            const playerComponent = component as PlayerControl|PlayerPhysics|CustomNetworkTransform;
            switch (idx) {
            case 0:
                playerComponent.owner.control = playerComponent as PlayerControl;
                break;
            case 1:
                playerComponent.owner.physics = playerComponent as PlayerPhysics;
                break;
            case 2:
                playerComponent.owner.transform = playerComponent as CustomNetworkTransform;
                break;
            }
        }
        this.set(component.netid, component);
    }

    removeComponent(component: Component) {
        if (this.gameData === component) {
            this.gameData = undefined;
        }
        if (this.voteBanSystem === component) {
            this.voteBanSystem = undefined;
        }
        if (component.owner instanceof Player) {
            if (component.owner.control === component) {
                component.owner.control = undefined;
            }
            if (component.owner.physics === component) {
                component.owner.physics = undefined;
            }
            if (component.owner.transform === component) {
                component.owner.transform = undefined;
            }
        }
        return this.delete(component.netid);
    }
}