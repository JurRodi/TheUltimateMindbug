import type { SubmitFunction } from '@sveltejs/kit';
import { showToast } from '$lib/toast.svelte';

/**
 * The `use:enhance` callback most forms need: flag a pending state while the
 * request runs, apply the default update, then toast / react on success.
 * `success` may be a function; it's evaluated when the form submits, so it can
 * read state (e.g. "was active?") from before the update lands.
 */
export function track(
	opts: {
		pending?: (on: boolean) => void;
		success?: string | (() => string);
		onSuccess?: () => void;
		reset?: boolean;
	} = {}
): SubmitFunction {
	return () => {
		const msg = typeof opts.success === 'function' ? opts.success() : opts.success;
		opts.pending?.(true);
		return async ({ result, update }) => {
			await update({ reset: opts.reset ?? true });
			opts.pending?.(false);
			if (result.type === 'success') {
				if (msg) showToast(msg);
				opts.onSuccess?.();
			}
		};
	};
}
