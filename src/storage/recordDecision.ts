import { createDatabase } from "@/storage/db.js";
import {
	type SaveDecisionInput,
	type StoredDecision,
	saveDecision,
} from "@/storage/repositories/decisionRepository.js";

export async function recordDecision(
	databasePath: string,
	input: SaveDecisionInput,
): Promise<StoredDecision> {
	const connection = await createDatabase(databasePath);

	try {
		return await saveDecision(connection.db, input);
	} finally {
		connection.client.close();
	}
}
