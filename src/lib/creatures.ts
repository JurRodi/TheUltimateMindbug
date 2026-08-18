/** Fixed set of Mindbug-style hybrid creatures used as fallback avatars. */
export const CREATURES = [
	'🦍',
	'🦈',
	'🕷️',
	'🐸',
	'🦎',
	'🐙',
	'🦇',
	'🦂',
	'🐺',
	'🦖',
	'🦉',
	'🐗',
	'🐉',
	'🦅',
	'🦏',
	'🦛',
	'🐊',
	'🦕',
	'🦧',
	'🐅',
	'🦁',
	'🐻',
	'🐍',
	'🦑',
	'🦭',
	'🦣',
	'🦬',
	'🐲'
];

/** A player's chosen emoji avatar, or a deterministic fallback from their id. */
export function creatureFor(id: number, avatar?: string | null): string {
	if (avatar) return avatar;
	return CREATURES[((id % CREATURES.length) + CREATURES.length) % CREATURES.length];
}

/** Server-side allow-list check: an avatar is valid only when cleared (null) or
    one of the fixed CREATURES emojis. The client picker only offers CREATURES,
    but a raw POST can send anything, so every write path must gate on this. */
export function isValidAvatar(avatar: string | null): boolean {
	return avatar === null || CREATURES.includes(avatar);
}
