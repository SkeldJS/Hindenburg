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
    /**
     * The global room's [GameData](https://github.com/codyphobe/among-us-protocol/blob/master/05_innernetobject_types/03_gamedata.md)
     * object.
     */
    gameData?: GameData;
    
    /**
     * The global room's [VoteBanSystem](https://github.com/codyphobe/among-us-protocol/blob/master/05_innernetobject_types/08_votebansystem.md)
     * object.
     */
    voteBanSystem?: VoteBanSystem;

    constructor(
        public readonly room: Room
    ) {
        super();
    }

    /**
     * Add a component to the room. Also assigns the component variables on objects
     * like {@link PlayerComponentStore.control} or {@link ComponentStore.gameData}
     * @param spawnType The type of spawn that this component is for.
     * @param idx The index of this component for the spawn object.
     * @param component The component to add.
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

    /**
     * Remove a component from the room. Also removes the component from objects
     * like {@link PlayerComponentStore.transform} or {@link ComponentStore.voteBanSystem}.
     * @param component The component to remove.
     */
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
        this.delete(component.netid);
    }
}