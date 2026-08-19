import { enablePush, type PushErrorKind } from './push-client';

/**
 * Shared reactive glue for the "enable notifications" flow, used by both the
 * account toggle and the prompt banner: it runs `enablePush()`, remembers the
 * failure reason/kind, and drives the {@link PushHelpDialog} open state — so the
 * two components don't each reimplement it.
 *
 * Usage in a component:
 *   const push = createPushEnabler();
 *   if (await push.enable()) { ...succeeded... }
 *   <PushHelpDialog bind:open={push.helpOpen} kind={push.helpKind} />
 */
export function createPushEnabler() {
	let helpOpen = $state(false);
	let helpKind = $state<PushErrorKind>('unknown');
	let error = $state<string | null>(null);

	return {
		get helpOpen() {
			return helpOpen;
		},
		set helpOpen(v: boolean) {
			helpOpen = v;
		},
		get helpKind() {
			return helpKind;
		},
		get error() {
			return error;
		},
		/** Attempt to enable push. On failure, records the reason and opens the help
		    dialog. Returns whether it succeeded. */
		async enable(): Promise<boolean> {
			error = null;
			const res = await enablePush();
			if (res.ok) return true;
			error = res.reason;
			helpKind = res.kind;
			helpOpen = true;
			return false;
		},
		/** Open the help dialog directly (e.g. from a "how to fix" link) for a known
		    situation such as a pre-existing blocked permission. */
		openHelp(kind: PushErrorKind) {
			helpKind = kind;
			helpOpen = true;
		}
	};
}
