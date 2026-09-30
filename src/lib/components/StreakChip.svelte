<script lang="ts">
	import { streakText, streakTone } from '$lib/format';
	let { streak, fire = true }: { streak: number; fire?: boolean } = $props();
</script>

<span class="chip {streakTone(streak)}">{streakText(streak, fire)}</span>
