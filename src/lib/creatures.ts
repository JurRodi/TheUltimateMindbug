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
