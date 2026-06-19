import { normalizeSocialMediaPostText } from "@/sources/social_media/resolveSocialMediaSignal.js";

function tokenize(text: string): string[] {
	return normalizeSocialMediaPostText(text)
		.toLowerCase()
		.split(/[^a-z0-9%]+/)
		.filter((token) => token.length >= 4);
}

/** True when why cites concrete wording or numbers from the post text. */
export function whyReferencesPostText(why: string, postText: string): boolean {
	const normalizedPost = normalizeSocialMediaPostText(postText).toLowerCase();
	const normalizedWhy = normalizeSocialMediaPostText(why).toLowerCase();

	const numbers = normalizedWhy.match(/\d[\d,.%]*/g) ?? [];
	if (numbers.some((value) => normalizedPost.includes(value))) {
		return true;
	}

	return tokenize(why).some((token) => normalizedPost.includes(token));
}
