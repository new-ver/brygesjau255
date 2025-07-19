<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	interface GamePlayer {
		id: string;
		name: string;
		affiliation: 'cult' | 'townsfolk' | null;
		character: string | null;
		joined_at: string;
		is_alive: boolean;
	}

	interface GameState {
		id: number;
		status: 'lobby' | 'night' | 'day' | 'voting' | 'finished';
		current_phase: string;
		day_number: number;
		created_at: string;
		updated_at: string;
	}

	let playerName = '';
	let players: GamePlayer[] = [];
	let gameState: GameState | null = null;
	let isJoining = false;
	let joinMessage = '';
	let subscription: RealtimeChannel | null = null;

	async function joinGame() {
		console.log('🎮 Attempting to join game with name:', playerName);

		if (!playerName.trim()) {
			joinMessage = 'Please enter your name';
			return;
		}

		// Check if name is already taken
		if (players.some((p) => p.name.toLowerCase() === playerName.toLowerCase())) {
			joinMessage = 'This name is already taken';
			return;
		}

		isJoining = true;
		joinMessage = '';

		try {
			console.log('📡 Inserting player into database...');
			const { data, error } = await supabase
				.from('game_players')
				.insert([
					{
						name: playerName.trim(),
						affiliation: null, // Will be assigned when admin starts game
						character: null,
						is_alive: true
					}
				])
				.select();

			if (error) {
				console.error('❌ Database error:', error);
				throw error;
			}

			console.log('✅ Player inserted successfully:', data);
			joinMessage = `${data[0].name} joined the village!`;
			playerName = '';

			await loadGameData();
		} catch (error: unknown) {
			console.error('💥 Join game error:', error);
			joinMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
		} finally {
			isJoining = false;
		}
	}

	async function loadGameData() {
		console.log('📊 Loading game data...');
		try {
			// Load players
			const { data: playersData, error: playersError } = await supabase
				.from('game_players')
				.select('*')
				.order('joined_at', { ascending: true });

			if (playersError) {
				console.error('❌ Load players error:', playersError);
				throw playersError;
			}

			console.log('📋 Players loaded:', playersData);
			players = playersData || [];

			// Load game state
			const { data: stateData, error: stateError } = await supabase
				.from('game_state')
				.select('*')
				.single();

			if (stateError) {
				// Ignore "no rows" error - game hasn't started yet
				if (
					stateError.code !== 'PGRST116' &&
					!stateError.message.includes('Results contain 0 rows')
				) {
					throw stateError;
				}
				gameState = null;
			} else {
				gameState = stateData;
				// Check if we should navigate to game board
				checkForGameTransition();
			}
		} catch (error) {
			console.error('💥 Error loading game data:', error);
		}
	}

	function checkForGameTransition() {
		// If game has started (status is no longer lobby), navigate to game board
		if (gameState && gameState.status !== 'lobby') {
			console.log('🎮 Game has started! Navigating to game board...');
			goto('/whispers/game'); // Adjust path as needed
		}
	}

	onMount(() => {
		loadGameData();

		// Set up real-time subscription for both players and game state
		subscription = supabase
			.channel('lobby_channel')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'game_players' }, () => {
				console.log('🔄 Player data changed, reloading...');
				loadGameData();
			})
			.on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, (payload) => {
				console.log('🎮 Game state changed:', payload);
				loadGameData(); // This will trigger checkForGameTransition
			})
			.subscribe();
	});

	onDestroy(() => {
		if (subscription) {
			supabase.removeChannel(subscription);
		}
	});
</script>

<svelte:head>
	<title>Village of Shadows - Game Lobby</title>
</svelte:head>

<!-- Join Game Section -->
<section class="village-panel join-game-section">
	<h3>🏘️ Enter the Village</h3>
	<p class="join-description">
		State your name and join the survivors. Trust no one—the cult walks among you.
	</p>

	<form on:submit|preventDefault={joinGame} class="join-form">
		<div class="form-group">
			<label for="name">Your Name</label>
			<input
				id="name"
				type="text"
				bind:value={playerName}
				placeholder="Enter your name..."
				required
				class="dark-input"
				disabled={isJoining}
				maxlength="20"
			/>
		</div>

		<button
			type="submit"
			disabled={isJoining || !playerName.trim()}
			class="cult-button"
			class:loading={isJoining}
		>
			{isJoining ? 'Entering Village...' : 'Join the Village'}
		</button>

		{#if joinMessage}
			<div
				class="join-message"
				class:success={joinMessage.includes('joined')}
				class:error={joinMessage.includes('Error') || joinMessage.includes('taken')}
				class:info={joinMessage.includes('cleared')}
			>
				{joinMessage}
			</div>
		{/if}
	</form>
</section>

<!-- Updated Villagers Gathered Section -->
<section class="village-panel">
	<div class="lobby-header">
		<h3>👥 Villagers Gathered</h3>
		<div class="player-counter">
			<span class="count">{players.length}</span> souls in the village
		</div>
	</div>

	{#if players.length === 0}
		<div class="empty-lobby">
			<p>The village lies empty and silent...</p>
			<p class="whisper">Waiting for brave souls to arrive...</p>
		</div>
	{:else}
		<div class="players-grid">
			{#each players as player (player.id)}
				<div class="player-card">
					<div class="player-avatar">
						{player.name.charAt(0).toUpperCase()}
					</div>
					<div class="player-info">
						<h4 class="player-name">{player.name}</h4>
						<p class="join-time">
							Arrived {new Date(player.joined_at).toLocaleTimeString()}
						</p>
						{#if player.affiliation}
							<p class="player-role">
								{player.affiliation} - {player.character || 'Role assigned'}
							</p>
						{/if}
					</div>
					<div class="player-status">
						<span class="status-dot alive"></span>
					</div>
				</div>
			{/each}
		</div>

		<div class="lobby-status">
			{#if gameState?.status === 'lobby'}
				<div class="waiting-message">
					<div class="status-indicator pulsing"></div>
					<div>
						<h4>Waiting for Storyteller</h4>
						<p>The game master will begin when ready... ({players.length} players joined)</p>
					</div>
				</div>
			{:else if !gameState}
				<div class="waiting-message">
					<div class="status-indicator pulsing"></div>
					<div>
						<h4>Lobby Open</h4>
						<p>Gathering villagers... The storyteller will begin soon.</p>
					</div>
				</div>
			{:else}
				<div class="starting-message">
					<div class="status-indicator starting"></div>
					<div>
						<h4>Game Starting!</h4>
						<p>The storyteller has begun the tale. Roles are being assigned...</p>
					</div>
				</div>
			{/if}

			<!-- Admin and utility buttons -->
			<div
				style="display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; margin-top: 1rem;"
			>
				<button class="admin-link-btn" on:click={() => goto('/admin')}>
					🎭 Storyteller Panel
				</button>
			</div>
		</div>
	{/if}
</section>

<style>
	/* ==========================================================================
     CULT VILLAGE HORROR GAME - COMPONENT SCOPED STYLES
     ========================================================================== */

	/* Join Game Section */
	.join-game-section {
		margin-bottom: 2rem;
	}

	.join-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 400px;
		margin: 0 auto;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		color: #d4d4d8;
		font-family: 'Georgia', serif;
		font-weight: 600;
		background: none;
		-webkit-background-clip: unset;
		-webkit-text-fill-color: unset;
	}

	.dark-input {
		background: linear-gradient(135deg, rgba(0, 0, 0, 0.6), rgba(20, 20, 40, 0.8));
		border: 2px solid rgba(139, 0, 0, 0.3);
		color: #d4d4d8;
		padding: 1rem;
		border-radius: 10px;
		font-family: 'Georgia', serif;
		transition: all 0.3s ease;
		width: 100%;
		font-size: 1rem;
		animation: none;
		box-shadow: none;
	}

	.dark-input:focus {
		outline: none;
		border-color: #8b0000;
		box-shadow: 0 0 15px rgba(139, 0, 0, 0.4);
		background: linear-gradient(135deg, rgba(139, 0, 0, 0.1), rgba(20, 20, 40, 0.9));
	}

	.dark-input::placeholder {
		color: #8b8680;
	}

	.dark-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Lobby Status Section */
	.lobby-status {
		margin-top: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: center;
	}

	.waiting-message,
	.starting-message {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem;
		border-radius: 15px;
		text-align: left;
		width: 100%;
		max-width: 500px;
	}

	.waiting-message {
		background: linear-gradient(135deg, rgba(25, 25, 112, 0.2), rgba(0, 0, 0, 0.6));
		border: 2px solid rgba(25, 25, 112, 0.4);
		color: #d4d4d8;
	}

	.starting-message {
		background: linear-gradient(135deg, rgba(139, 0, 0, 0.3), rgba(0, 0, 0, 0.8));
		border: 2px solid #8b0000;
		color: #ffffff;
		animation: deathPulse 3s ease-in-out infinite;
	}

	.status-indicator {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-indicator.pulsing {
		background: #191970;
		animation: statusPulse 2s ease-in-out infinite;
	}

	.status-indicator.starting {
		background: #8b0000;
		animation: bloodPulse 1.5s ease-in-out infinite;
	}

	.waiting-message h4,
	.starting-message h4 {
		margin: 0 0 0.5rem 0;
		font-family: 'Georgia', serif;
		font-size: 1.2rem;
		font-weight: 600;
	}

	.waiting-message p,
	.starting-message p {
		margin: 0;
		opacity: 0.9;
		font-style: italic;
	}

	.admin-link-btn {
		background: linear-gradient(135deg, rgba(139, 0, 0, 0.1), rgba(25, 25, 112, 0.1));
		border: 1px solid rgba(139, 0, 0, 0.3);
		color: #8b8680;
		padding: 0.8rem 1.5rem;
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.3s ease;
		font-family: 'Georgia', serif;
		font-size: 0.9rem;
		text-decoration: none;
		display: inline-block;
		margin-top: 1rem;
	}

	.admin-link-btn:hover {
		background: linear-gradient(135deg, rgba(139, 0, 0, 0.2), rgba(25, 25, 112, 0.2));
		border-color: #8b0000;
		color: #d4d4d8;
		transform: translateY(-1px);
	}

	.player-role {
		font-size: 0.8rem;
		color: #8b8680;
		margin: 0.25rem 0 0 0;
		font-style: italic;
	}

	/* Message Display */
	.join-message {
		margin-top: 1rem;
		padding: 1rem;
		border-radius: 10px;
		text-align: center;
		font-weight: 600;
		font-family: 'Georgia', serif;
	}

	.join-message.success {
		background: linear-gradient(135deg, rgba(5, 150, 105, 0.2), rgba(0, 0, 0, 0.6));
		border: 2px solid rgba(5, 150, 105, 0.4);
		color: #10b981;
	}

	.join-message.error {
		background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(0, 0, 0, 0.6));
		border: 2px solid rgba(239, 68, 68, 0.4);
		color: #ef4444;
	}

	.join-message.info {
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(0, 0, 0, 0.6));
		border: 2px solid rgba(59, 130, 246, 0.4);
		color: #60a5fa;
	}

	/* Enhanced animations */
	@keyframes statusPulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.6;
			transform: scale(1.1);
		}
	}

	@keyframes bloodPulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
			background: #8b0000;
		}
		50% {
			opacity: 0.8;
			transform: scale(1.2);
			background: #ff0000;
		}
	}

	/* Loading state for join button */
	.cult-button.loading {
		pointer-events: none;
		opacity: 0.7;
		position: relative;
	}

	.cult-button.loading::after {
		content: '';
		position: absolute;
		right: 1rem;
		top: 50%;
		transform: translateY(-50%);
		width: 16px;
		height: 16px;
		border: 2px solid transparent;
		border-top: 2px solid currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: translateY(-50%) rotate(0deg);
		}
		100% {
			transform: translateY(-50%) rotate(360deg);
		}
	}

	/* Mobile responsive adjustments */
	@media (max-width: 768px) {
		.waiting-message,
		.starting-message {
			padding: 1rem;
			flex-direction: column;
			text-align: center;
			gap: 0.75rem;
		}

		.status-indicator {
			width: 20px;
			height: 20px;
		}

		.lobby-status {
			margin-top: 1.5rem;
		}

		.admin-link-btn,
		.clear-lobby-btn {
			width: 100%;
			text-align: center;
		}

		.join-form {
			max-width: 100%;
		}

		.cult-button {
			width: 100%;
		}
	}

	@media (max-width: 480px) {
		.join-form {
			gap: 0.75rem;
		}

		.form-group {
			margin-bottom: 1rem;
		}

		.dark-input {
			padding: 0.8rem;
			font-size: 16px; /* Prevents zoom on iOS */
		}

		.cult-button {
			padding: 1rem;
			font-size: 0.9rem;
		}

		.waiting-message h4,
		.starting-message h4 {
			font-size: 1.1rem;
		}

		.waiting-message p,
		.starting-message p {
			font-size: 0.9rem;
		}

		.admin-link-btn,
		.clear-lobby-btn {
			padding: 0.7rem 1.2rem;
			font-size: 0.85rem;
		}
	}

	/* Dark Village Interface Elements */
	.village-panel {
		background:
			linear-gradient(135deg, rgba(25, 25, 112, 0.1), rgba(139, 0, 0, 0.05)),
			linear-gradient(45deg, rgba(0, 0, 0, 0.8), rgba(20, 20, 40, 0.9));
		backdrop-filter: blur(15px);
		border: 2px solid rgba(139, 0, 0, 0.3);
		border-radius: 20px;
		padding: 2.5rem;
		margin-bottom: 2rem;
		position: relative;
		overflow: hidden;
		box-shadow:
			0 10px 30px rgba(0, 0, 0, 0.5),
			inset 0 1px 0 rgba(139, 0, 0, 0.1);
	}

	.village-panel::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background:
			radial-gradient(circle at 20% 80%, rgba(139, 0, 0, 0.03) 0%, transparent 50%),
			radial-gradient(circle at 80% 20%, rgba(25, 25, 112, 0.02) 0%, transparent 50%);
		z-index: -1;
	}

	.village-panel h3 {
		color: #d4d4d8;
		font-family: 'Georgia', serif;
		font-size: 1.5rem;
		margin-bottom: 1.5rem;
		background: none;
		-webkit-background-clip: unset;
		-webkit-text-fill-color: unset;
		text-shadow: none;
		animation: none;
	}

	.join-description {
		color: #8b8680;
		margin-bottom: 1.5rem;
		font-style: italic;
	}

	.cult-button {
		background: linear-gradient(135deg, rgba(139, 0, 0, 0.2), rgba(25, 25, 112, 0.15));
		border: 2px solid rgba(139, 0, 0, 0.4);
		color: #d4d4d8;
		padding: 1.2rem 2.5rem;
		border-radius: 15px;
		cursor: pointer;
		transition: all 0.4s ease;
		font-weight: 600;
		font-family: 'Georgia', serif;
		letter-spacing: 0.05em;
		position: relative;
		overflow: hidden;
		font-size: 1rem;
		width: auto;
		text-transform: none;
		text-shadow: none;
		animation: none;
		box-shadow: none;
	}

	.cult-button::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(139, 0, 0, 0.3), transparent);
		transition: left 0.5s ease;
	}

	.cult-button:hover::before {
		left: 100%;
	}

	.cult-button:hover {
		background: linear-gradient(135deg, rgba(139, 0, 0, 0.4), rgba(25, 25, 112, 0.3));
		border-color: #8b0000;
		box-shadow: 0 8px 25px rgba(139, 0, 0, 0.4);
		transform: translateY(-3px);
		color: #ffffff;
	}

	.cult-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Form Elements */
	.form-group {
		margin-bottom: 1.5rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		color: #d4d4d8;
		font-family: 'Georgia', serif;
		font-weight: 600;
		background: none;
		-webkit-background-clip: unset;
		-webkit-text-fill-color: unset;
	}

	.dark-input {
		background: linear-gradient(135deg, rgba(0, 0, 0, 0.6), rgba(20, 20, 40, 0.8));
		border: 2px solid rgba(139, 0, 0, 0.3);
		color: #d4d4d8;
		padding: 1rem;
		border-radius: 10px;
		font-family: 'Georgia', serif;
		transition: all 0.3s ease;
		width: 100%;
		font-size: 1rem;
		animation: none;
		box-shadow: none;
	}

	.dark-input:focus {
		outline: none;
		border-color: #8b0000;
		box-shadow: 0 0 15px rgba(139, 0, 0, 0.4);
		background: linear-gradient(135deg, rgba(139, 0, 0, 0.1), rgba(20, 20, 40, 0.9));
	}

	.dark-input::placeholder {
		color: #8b8680;
	}

	/* Player Cards */
	.lobby-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.player-counter {
		color: #8b8680;
		font-family: 'Georgia', serif;
	}

	.count {
		color: #8b0000;
		font-weight: bold;
		font-size: 1.2rem;
	}

	.empty-lobby {
		text-align: center;
		padding: 2rem;
		color: #8b8680;
		font-style: italic;
	}

	.whisper {
		opacity: 0.7;
		font-size: 0.9rem;
	}

	.players-grid {
		display: grid;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.player-card {
		background:
			linear-gradient(135deg, rgba(0, 0, 0, 0.6), rgba(20, 20, 40, 0.8)),
			linear-gradient(45deg, rgba(139, 0, 0, 0.05), rgba(25, 25, 112, 0.03));
		border: 1px solid rgba(139, 0, 0, 0.3);
		border-radius: 15px;
		padding: 1.5rem;
		transition: all 0.4s ease;
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.player-card:hover {
		border-color: #8b0000;
		box-shadow: 0 8px 20px rgba(139, 0, 0, 0.3);
		transform: translateY(-2px);
	}

	.player-avatar {
		width: 50px;
		height: 50px;
		background: linear-gradient(135deg, #8b0000, #191970);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: bold;
		font-size: 1.2rem;
	}

	.player-info {
		flex: 1;
	}

	.player-name {
		margin: 0 0 0.5rem 0;
		color: #d4d4d8;
		font-family: 'Georgia', serif;
		font-size: 1.1rem;
		background: none;
		-webkit-background-clip: unset;
		-webkit-text-fill-color: unset;
	}

	.join-time {
		margin: 0;
		color: #8b8680;
		font-size: 0.9rem;
	}

	.player-status {
		display: flex;
		align-items: center;
	}

	.status-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}

	.status-dot.alive {
		background: #32cd32;
		box-shadow: 0 0 8px rgba(50, 205, 50, 0.5);
	}

	/* Horror Animations */
	@keyframes bloodFlow {
		0%,
		100% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
	}

	@keyframes weaponGlint {
		0%,
		100% {
			transform: translateY(-50%) rotate(-15deg) scale(1);
			filter: drop-shadow(0 0 15px rgba(139, 0, 0, 0.7));
		}
		50% {
			transform: translateY(-50%) rotate(15deg) scale(1.1);
			filter: drop-shadow(0 0 25px rgba(139, 0, 0, 1)) hue-rotate(30deg);
		}
	}

	@keyframes skullFloat {
		0%,
		100% {
			transform: translateY(-50%) scale(1);
			filter: drop-shadow(0 0 15px rgba(75, 0, 0, 0.8));
		}
		33% {
			transform: translateY(-60%) scale(1.05);
			filter: drop-shadow(0 0 20px rgba(139, 0, 0, 0.9));
		}
		66% {
			transform: translateY(-40%) scale(0.95);
			filter: drop-shadow(0 0 12px rgba(25, 25, 112, 0.7));
		}
	}

	@keyframes occultSpin {
		0% {
			transform: translateX(-50%) rotate(0deg);
		}
		100% {
			transform: translateX(-50%) rotate(360deg);
		}
	}

	@keyframes creepingFog {
		0%,
		100% {
			opacity: 0.3;
			transform: scaleX(1);
		}
		50% {
			opacity: 0.6;
			transform: scaleX(1.2);
		}
	}

	@keyframes fogDrift {
		0% {
			transform: translateX(-20%);
		}
		100% {
			transform: translateX(20%);
		}
	}

	@keyframes ominousShadows {
		0%,
		100% {
			opacity: 0.2;
			transform: rotate(0deg) scale(1);
		}
		50% {
			opacity: 0.4;
			transform: rotate(180deg) scale(1.1);
		}
	}

	@keyframes bloodFall {
		0% {
			transform: translateY(-100vh) rotate(0deg);
			opacity: 0;
		}
		10% {
			opacity: 0.8;
		}
		90% {
			opacity: 0.6;
		}
		100% {
			transform: translateY(100vh) rotate(360deg);
			opacity: 0;
		}
	}

	@keyframes subtleGlow {
		0%,
		100% {
			opacity: 0.7;
			text-shadow: 0 0 10px rgba(139, 0, 0, 0.3);
		}
		50% {
			opacity: 1;
			text-shadow: 0 0 20px rgba(139, 0, 0, 0.6);
		}
	}

	@keyframes deathPulse {
		0%,
		100% {
			box-shadow: 0 0 25px rgba(139, 0, 0, 0.5);
			border-color: #8b0000;
		}
		50% {
			box-shadow: 0 0 35px rgba(139, 0, 0, 0.8);
			border-color: #ff0000;
		}
	}

	/* Mobile Responsive Design */
	@media (max-width: 768px) {
		.village-panel {
			padding: 1.5rem;
		}

		.cult-button {
			padding: 1rem 1.5rem;
			font-size: 0.9rem;
			min-height: 44px; /* Touch-friendly */
		}

		.dark-input {
			padding: 0.8rem;
			font-size: 16px; /* Prevents zoom on iOS */
			min-height: 44px;
		}

		.player-card {
			padding: 1rem;
		}

		.player-avatar {
			width: 40px;
			height: 40px;
			font-size: 1rem;
		}
	}

	/* Touch-friendly improvements for mobile */
	@media (max-width: 480px) {
		.village-panel {
			padding: 1rem;
		}

		.cult-button {
			width: 100%;
			padding: 1.2rem;
		}

		.players-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
