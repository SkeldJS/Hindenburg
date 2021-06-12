import { PlayerControl } from "../components/PlayerControl";
import { PlayerPhysics } from "../components/PlayerPhysics";
import { CustomNetworkTransform } from "../components/CustomNetworkTransform";

export class PlayerComponentStore {
    control?: PlayerControl;
    physics?: PlayerPhysics;
    transform?: CustomNetworkTransform;
}