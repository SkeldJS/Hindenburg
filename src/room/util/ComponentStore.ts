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

    /**
     * Add a component to the room. Also assigns the component variables on objects
     * like {@link Player.control} or {@link ComponentStore.gameData}
     * @param spawnType 
     * @param idx a
     * @param component 
     */
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
        if (component.owner instanceof Player) {
            if (spawnType === SpawnType.Player) {
                switch (idx) {
                case 0:
                    component.owner.components.control = component as PlayerControl;
                    break;
                case 1:
                    component.owner.components.physics = component as PlayerPhysics;
                    break;
                case 2:
                    component.owner.components.transform = component as CustomNetworkTransform;
                    break;
                }
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
            if (component.owner.components.control === component) {
                component.owner.components.control = undefined;
            }
            if (component.owner.components.physics === component) {
                component.owner.components.physics = undefined;
            }
            if (component.owner.components.transform === component) {
                component.owner.components.transform = undefined;
            }
        }
        return this.delete(component.netid);
    }
}