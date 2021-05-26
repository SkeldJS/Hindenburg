import ch from "chalk";

import { Color } from "@skeldjs/constant";
import { ColorCodes, PlayerData } from "@skeldjs/core";

const chalk = new ch.Instance({ level: 2 });

export function fmtPlayer(player?: PlayerData) {
	if (!player) return chalk.grey("<No Player>");

	const has_data = !!player.data;
	const colour = has_data ? player.data.color : Color.Grey;
	const name = has_data ? player.data.name || "<No Name>" : "<No Data>";
	const id = player.id || "<No ID>";

	const consoleClr: ch.Chalk = ColorCodes[colour]?.hex
        ? chalk.hex(ColorCodes[colour]?.hex)
        : chalk.gray;

	return consoleClr(name) + " " + chalk.grey("(" + id + ")");
}