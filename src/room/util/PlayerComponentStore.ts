import {
    PlayerControl,
    PlayerPhysics,
    CustomNetworkTransform
} from "../components";

export class PlayerComponentStore {
    /**
     * This player's [PlayerControl](https://github.com/codyphobe/among-us-protocol/blob/master/05_innernetobject_types/04_playercontrol.md)
     * object.
     */
    control?: PlayerControl;
    
    /**
     * This player's [PlayerPhysics](https://github.com/codyphobe/among-us-protocol/blob/master/05_innernetobject_types/09_playerphysics.md)
     * object.
     */
    physics?: PlayerPhysics;

    /**
     * This player's [CustomNetworkTransform](https://github.com/codyphobe/among-us-protocol/blob/master/05_innernetobject_types/10_customnetworktransform.md)
     * object.
     */
    transform?: CustomNetworkTransform;
}