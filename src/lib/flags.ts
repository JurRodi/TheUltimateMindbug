/** Admin-toggled feature flags.

    A flag is defined once in `FLAGS` and referenced everywhere by its key.
    Values are stored per key in the `app_settings` table; an absent row means
    the flag's `default`. Adding a feature flag is a single entry here plus using
    `flags[key]` wherever it gates behaviour. */

export type FlagKey = 'mvp';

export interface FlagDef {
	/** Label shown in the admin toggle UI. */
	label: string;
	/** Help text shown under the label. */
	description: string;
	/** Value used when no row is stored for the flag. */
	default: boolean;
}

export const FLAGS: Record<FlagKey, FlagDef> = {
	mvp: {
		label: 'MVP voting',
		description: 'Most-valuable-play voting, push prompts and MVP stats across the app.',
		default: false
	}
};

export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[];

/** The resolved on/off state of every flag. */
export type Flags = Record<FlagKey, boolean>;

export function isFlagKey(key: string): key is FlagKey {
	return Object.prototype.hasOwnProperty.call(FLAGS, key);
}

/** Build the full flag state from stored settings rows: each known flag takes
    its stored value (on only for the exact string "true") or its default when
    no row exists. Rows for unknown keys are ignored. */
export function resolveFlags(rows: { key: string; value: string }[]): Flags {
	const stored = new Map(rows.map((r) => [r.key, r.value]));
	const flags = {} as Flags;
	for (const key of FLAG_KEYS) {
		flags[key] = stored.has(key) ? stored.get(key) === 'true' : FLAGS[key].default;
	}
	return flags;
}
