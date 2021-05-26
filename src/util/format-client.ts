import ch from "chalk";
import { Int2Code } from "@skeldjs/util";

import { Client } from "../Client";

const chalk = new ch.Instance({ level: 2 });

export function fmtClient(client?: Client) {
	if (!client) return chalk.grey("<No Client>");

	const name = client.identified ? client.username || "<No Username>" : "<Unidentified>";
	const id = client.clientid || "<No ID>";
    const room = client.room ? Int2Code(client.room.code) : "";
    const remote = client.address;
    
    const bracketTerms = [ id, ...(room ? [ room ] : []), remote ];

	return chalk.blue(name) + chalk.grey(" (" + bracketTerms.join(", ") + ")");
}