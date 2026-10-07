<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { Game, type Frame, type RunOver } from '$lib/game/game';
	import { HEADWEAR, OUTFITS, grouped, type Headwear, type Outfit } from '$lib/game/models';
	import {
		MODES,
		dailySeed,
		jakartaDate,
		modeOf,
		randomSeed,
		readSeedCode,
		seedCode,
		type Mode
	} from '$lib/game/seeds';

	type Screen = 'menu' | 'leader' | 'running' | 'over';

	const MODE_KEY = 'gerombolan:mode';
	const LEADER_KEY = 'gerombolan:leader';
	const ZOOM_KEY = 'gerombolan:zoom';

	let game: Game | undefined;
	let screen = $state<Screen>('menu');
	let frame = $state<Frame>({ meters: 0, crowd: { count: 1, x: -100, y: -100 } });
	let lastRun = $state<RunOver | undefined>();
	let newBest = $state(false);
	let mode = $state<Mode>(read(MODE_KEY, 'endless'));
	/** The run being played: its mode and seed, and whether the player typed the seed in. */
	let current = $state<{ mode: Mode; seed: number; chosen: boolean }>({ mode: 'endless', seed: 0, chosen: false });
	let seedText = $state('');
	let seedProblem = $state('');
	// Bests are kept per mode, and per day for the Daily.
	const bestKey = (of: Mode) => `gerombolan:best:${of}${of === 'daily' ? `:${jakartaDate()}` : ''}`;
	let best = $state(read(bestKey(read(MODE_KEY, 'endless')), 0));
	let zoom = read(ZOOM_KEY, 1);
	let leader = $state(read<{ outfit: Outfit; headwear: Headwear }>(LEADER_KEY, { outfit: 'white', headwear: 'peci' }));

	// Saved on this computer only: the best distance and how the leader looks.
	function read<Value>(key: string, fallback: Value): Value {
		try {
			const saved = localStorage.getItem(key);
			return saved === null ? fallback : (JSON.parse(saved) as Value);
		} catch {
			return fallback;
		}
	}

	function save(key: string, value: unknown) {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch {
			// Private windows can refuse storage; it just isn't remembered.
		}
	}

	function choose(next: Mode) {
		mode = next;
		save(MODE_KEY, mode);
		best = read(bestKey(mode), 0);
	}

	/** Starts a run: a fresh seed for Endless and WNI, today's for the Daily, or one the player chose. */
	function play(chosen?: { mode: Mode; seed: number }) {
		const runMode = chosen?.mode ?? mode;
		const seed = chosen?.seed ?? (runMode === 'daily' ? dailySeed(jakartaDate()) : randomSeed());
		current = { mode: runMode, seed, chosen: !!chosen };
		best = read(bestKey(runMode), 0);
		newBest = false;
		screen = 'running';
		game?.start(seed, modeOf(runMode).world);
	}

	/** From the run-over screen: the same seed again if the player chose it, otherwise a new run. */
	function playAgain() {
		play(current.chosen ? { mode: current.mode, seed: current.seed } : undefined);
	}

	function playSeed(event: SubmitEvent) {
		event.preventDefault();
		const read = readSeedCode(seedText);
		if (!read) {
			seedProblem = 'That isn\'t a seed. Seeds look like E-1A2B3C: a letter for the mode, then up to seven letters and digits.';
			return;
		}
		seedProblem = '';
		play(read);
	}

	function menu() {
		screen = 'menu';
		game?.showMenu();
	}

	function finish(result: RunOver) {
		lastRun = result;
		// A seed the player chose doesn't count toward their best: it can be practiced.
		newBest = !current.chosen && result.meters > best;
		if (newBest) {
			best = result.meters;
			save(bestKey(current.mode), best);
		}
		screen = 'over';
	}

	function dress(change: Partial<typeof leader>) {
		leader = { ...leader, ...change };
		save(LEADER_KEY, leader);
		game?.dress(leader.outfit, leader.headwear);
	}

	/** Zooms by a factor: above 1 moves the camera out, below 1 brings it in. */
	function zoomBy(factor: number) {
		if (!game) return;
		zoom = game.setZoom(zoom * factor);
		save(ZOOM_KEY, zoom);
	}

	// A scroll wheel, or a pinch on a trackpad, which arrives as a wheel event with Control held.
	function wheel(event: WheelEvent) {
		if (screen !== 'running' && screen !== 'over') return;
		event.preventDefault();
		zoomBy(Math.exp(event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)));
	}

	const LEFT = ['ArrowLeft', 'KeyA'];
	const RIGHT = ['ArrowRight', 'KeyD'];

	function key(event: KeyboardEvent, held: boolean) {
		if (screen === 'running' && LEFT.includes(event.code)) game?.steer('left', held);
		else if (screen === 'running' && RIGHT.includes(event.code)) game?.steer('right', held);
		else if (!held) return;
		else if (event.target instanceof HTMLInputElement) return;
		else if ((event.code === 'Space' || event.code === 'Enter') && screen === 'menu') play();
		else if ((event.code === 'Space' || event.code === 'Enter') && screen === 'over') playAgain();
		else if (screen === 'menu' && ['Digit1', 'Digit2', 'Digit3'].includes(event.code)) choose(MODES[Number(event.code.slice(-1)) - 1].id);
		else if (event.code === 'KeyL' && screen === 'menu') screen = 'leader';
		else if (event.code === 'Escape' && screen === 'leader') screen = 'menu';
		else if (event.code === 'Escape' && screen === 'over') menu();
		else if ((event.code === 'Equal' || event.code === 'NumpadAdd') && screen !== 'menu' && screen !== 'leader') zoomBy(0.85);
		else if ((event.code === 'Minus' || event.code === 'NumpadSubtract') && screen !== 'menu' && screen !== 'leader') zoomBy(1 / 0.85);
		else return;
		event.preventDefault();
	}

	// The game lives as long as its canvas: created with it, resized with the window, and torn
	// down with it.
	const runGame: Attachment<HTMLCanvasElement> = (canvas) => {
		game = new Game(
			canvas,
			(next) => (frame = next),
			(result) => finish(result)
		);
		game.dress(leader.outfit, leader.headwear);
		zoom = game.setZoom(zoom);
		game.showMenu();
		const resize = () => game?.resize();
		window.addEventListener('resize', resize);
		// Not passive: zooming replaces the page's own scrolling and pinch zoom.
		canvas.addEventListener('wheel', wheel, { passive: false });
		return () => {
			window.removeEventListener('resize', resize);
			canvas.removeEventListener('wheel', wheel);
			game?.destroy();
			game = undefined;
		};
	};
</script>

<svelte:window onkeydown={(event) => key(event, true)} onkeyup={(event) => key(event, false)} />

<main>
	<canvas {@attach runGame} aria-label="The road, with your crowd running along it"></canvas>

	{#if screen === 'running'}
		<div class="count" style:left="{frame.crowd.x}px" style:top="{frame.crowd.y}px">{grouped(frame.crowd.count)}</div>
		{#if frame.raid}
			<div class="count raid" style:left="{frame.raid.x}px" style:top="{frame.raid.y}px">
				{grouped(frame.raid.count)}
			</div>
		{/if}
		<div class="hud">
			<span>{grouped(frame.meters)} m</span>
			<span class="muted">{current.chosen ? 'Your seed' : `Best ${best} m`}</span>
			<span class="muted">{modeOf(current.mode).name} · {seedCode(current.mode, current.seed)}</span>
		</div>
	{/if}

	{#if screen === 'menu'}
		<section class="panel side">
			<h1>Gerombolan</h1>
			<p class="tagline">You've seen the advertisements. Now play the game, without them.</p>
			<fieldset>
				<legend>Mode</legend>
				<div class="choices">
					{#each MODES as option, index (option.id)}
						<button aria-pressed={mode === option.id} onclick={() => choose(option.id)}>
							{option.name} <kbd>{index + 1}</kbd>
						</button>
					{/each}
				</div>
				<p class="summary">{modeOf(mode).summary}</p>
			</fieldset>
			<div class="actions">
				<button class="primary" onclick={() => play()}>Play <kbd>Space</kbd></button>
				<button onclick={() => (screen = 'leader')}>Leader <kbd>L</kbd></button>
			</div>
			<form class="seed" onsubmit={playSeed}>
				<label for="seed">Play a seed</label>
				<div class="seed-row">
					<input
						id="seed"
						bind:value={seedText}
						placeholder="E-1A2B3C"
						autocomplete="off"
						spellcheck="false"
						aria-describedby={seedProblem ? 'seed-problem' : undefined}
						aria-invalid={seedProblem ? 'true' : undefined}
					/>
					<button type="submit">Play</button>
				</div>
				{#if seedProblem}<p id="seed-problem" class="problem">{seedProblem}</p>{/if}
			</form>
			<p class="muted">Steer with <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd></p>
			<p class="muted">Zoom with the scroll wheel, a pinch, or <kbd>+</kbd> <kbd>−</kbd></p>
			{#if best > 0}<p class="muted">Your best in {modeOf(mode).name}{mode === 'daily' ? ' today' : ''}: {best} m</p>{/if}
		</section>
	{/if}

	{#if screen === 'leader'}
		<section class="panel side" aria-labelledby="leader-heading">
			<h2 id="leader-heading">Your leader</h2>
			<p class="muted">They run in front and touch every gate first.</p>
			<fieldset>
				<legend>On their head</legend>
				<div class="choices">
					{#each HEADWEAR as option (option.id)}
						<button aria-pressed={leader.headwear === option.id} onclick={() => dress({ headwear: option.id })}>
							{option.name}
						</button>
					{/each}
				</div>
			</fieldset>
			<fieldset>
				<legend>Outfit</legend>
				<div class="choices">
					{#each OUTFITS as option (option.id)}
						<button aria-pressed={leader.outfit === option.id} onclick={() => dress({ outfit: option.id })}>
							<span class="swatch" style:background="#{option.color.toString(16).padStart(6, '0')}"></span>
							{option.name}
						</button>
					{/each}
				</div>
			</fieldset>
			<div class="actions">
				<button class="primary" onclick={() => (screen = 'menu')}>Done <kbd>Esc</kbd></button>
			</div>
		</section>
	{/if}

	{#if screen === 'over' && lastRun}
		<section class="panel" aria-live="polite">
			<h2>Your gerombolan made it {lastRun.meters} m</h2>
			<p class="muted">
				{#if current.chosen}A seed you chose doesn't count toward your best.
				{:else if newBest}A new best in {modeOf(current.mode).name}!
				{:else}Your best in {modeOf(current.mode).name}: {best} m{/if}
			</p>
			<p class="share">
				Seed <code class="code">{seedCode(current.mode, current.seed)}</code>
				<span class="muted">Share it, and anyone can run this exact street.</span>
			</p>
			<div class="actions">
				<button class="primary" onclick={playAgain}>{current.chosen ? 'Same seed again' : 'Run again'} <kbd>Space</kbd></button>
				<button onclick={menu}>Menu <kbd>Esc</kbd></button>
			</div>
		</section>
	{/if}
</main>

<style>
	main {
		position: fixed;
		inset: 0;
		overflow: hidden;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	/* Text sits on graphite panels, never straight on the scene, so it stays readable whatever is
	   behind it. */
	.panel {
		position: absolute;
		top: 50%;
		left: 50%;
		translate: -50% -50%;
		width: min(26rem, calc(100vw - 2rem));
		padding: 2rem 2.25rem;
		border-radius: 1.25rem;
		background: rgb(43 43 43 / 0.92);
		color: var(--text);
		text-align: center;
	}

	/* On the menu the panel sits to the left, so the leader stays in view. */
	.panel.side {
		left: max(1rem, 6vw);
		translate: 0 -50%;
		text-align: left;
	}

	h1 {
		margin: 0;
		font-size: 3rem;
		letter-spacing: -0.02em;
	}

	h2 {
		margin: 0;
		font-size: 1.6rem;
	}

	.tagline {
		margin: 0.75rem 0 1.5rem;
		font-size: 1.1rem;
		line-height: 1.45;
	}

	.muted {
		margin: 0.6rem 0 0;
		color: var(--muted);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin: 1.25rem 0 0.25rem;
	}

	.panel:not(.side) .actions {
		justify-content: center;
	}

	button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 1.1rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	button:hover {
		border-color: var(--muted);
	}

	/* The one primary action on each screen is pink, with graphite text on it. */
	button.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--on-accent);
	}

	button.primary kbd {
		border-color: rgb(43 43 43 / 0.35);
		background: rgb(255 255 255 / 0.35);
		color: var(--on-accent);
	}

	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}

	fieldset {
		margin: 1.25rem 0 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: 0.6rem;
		color: var(--muted);
		font-weight: 600;
	}

	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.choices button {
		padding: 0.4rem 0.8rem;
		font-weight: 500;
	}

	/* The chosen option: a pink edge, plus the pressed state screen readers announce. */
	.choices button[aria-pressed='true'] {
		border: 2px solid var(--accent);
		padding: calc(0.4rem - 1px) calc(0.8rem - 1px);
	}

	.summary {
		margin: 0.6rem 0 0;
		color: var(--muted);
		font-size: 0.95rem;
		line-height: 1.4;
	}

	.seed {
		margin-top: 1.25rem;
	}

	.seed label {
		display: block;
		margin-bottom: 0.4rem;
		color: var(--muted);
		font-weight: 600;
	}

	.seed-row {
		display: flex;
		gap: 0.5rem;
	}

	input {
		flex: 1;
		min-width: 0;
		padding: 0.55rem 0.9rem;
		border: 1px solid var(--muted);
		border-radius: 999px;
		background: #2b2b2b;
		color: var(--text);
		font: inherit;
		text-transform: uppercase;
	}

	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.problem {
		margin: 0.5rem 0 0;
		color: #f58c9d;
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.share {
		margin: 1rem 0 0;
		line-height: 1.6;
	}

	.share .muted {
		display: block;
		margin: 0;
		font-size: 0.9rem;
	}

	/* The seed code: one click selects it, ready to copy. */
	.code {
		padding: 0.1rem 0.5rem;
		border-radius: 0.4rem;
		background: var(--surface);
		font-size: 1.05rem;
		font-weight: 700;
		user-select: all;
		cursor: text;
	}

	.swatch {
		width: 0.9rem;
		height: 0.9rem;
		border: 1px solid var(--border);
		border-radius: 50%;
	}

	kbd {
		display: inline-block;
		min-width: 1.4em;
		padding: 0.05em 0.4em;
		border: 1px solid var(--border);
		border-radius: 0.35em;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.8em;
		font-weight: 500;
		text-align: center;
	}

	.hud {
		position: absolute;
		top: 1rem;
		left: 1rem;
		display: flex;
		gap: 1rem;
		padding: 0.5rem 1rem;
		border-radius: 999px;
		background: rgb(43 43 43 / 0.85);
		color: var(--text);
		font-size: 1.1rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.hud .muted {
		margin: 0;
		font-weight: 500;
	}

	/* The crowd's size, floating above it: pink, the one accent, with graphite text on it. */
	.count {
		position: absolute;
		translate: -50% -100%;
		padding: 0.2rem 0.75rem;
		border-radius: 999px;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 1.25rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		pointer-events: none;
	}

	/* The raid's count: in the raiders' red, with white text on it (4.9:1). */
	.count.raid {
		background: #c8423b;
		color: #ffffff;
	}
</style>
