import ch from "chalk";

import { Color } from "@skeldjs/constant";
import { ColorCodes, PlayerData } from "@skeldjs/core";

const chalk = new ch.Instance({ level: 2 });

export function fmtPlayer(player?: PlayerData) {
	if (!player) return chalk.grey("<No Player>");

	const colour = player.info ? player.info.color : Color.Grey;
	const name = player.info ? player.info.name || "<No Name>" : "<No Data>";
	const id = player.id || "<No ID>";

	const consoleClr: ch.Chalk = ColorCodes[colour as keyof typeof ColorCodes]?.hex
        ? chalk.hex(ColorCodes[colour as keyof typeof ColorCodes]?.hex)
        : chalk.gray;

	return consoleClr(name) + " " + chalk.grey("(" + id + ")");
}