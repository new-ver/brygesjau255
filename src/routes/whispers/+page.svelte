<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import { gameStore, players, gameState, connectionStatus, messages } from '$lib/stores/gameState';

	// Local state
	let playerName = '';
	let isJoining = false;
	let joinMessage = '';
	let currentPlayerId: string | null = null;

	// Reactive subscriptions
	$: allPlayers = $players;
	$: currentGameState = $gameState;
	$: connection = $connectionStatus;
	$: allMessages = $messages;

	// Reactive game status
	$: gameHasStarted = currentGameState && currentGameState.status !== 'lobby';
	$: isGameActive =
		currentGameState?.status &&
		currentGameState.status !== 'lobby' &&
		currentGameState.status !== 'finished';

	// Join game function
	async function joinGame() {
		console.log('🎮 Attempting to join game with name:', playerName);

		if (!playerName.trim()) {
			joinMessage = 'Please enter your name';
			return;
		}

		// Check if name is already taken
		if (allPlayers.some((p) => p.name.toLowerCase() === playerName.toLowerCase())) {
			joinMessage = 'This name is already taken';
			return;
		}

		isJoining = true;
		joinMessage = '';

		try {
			const playerId = crypto.randomUUID();

			console.log('📡 Inserting player into database...');
			const { data, error } = await supabase
				.from('game_players')
				.insert([
					{
						id: playerId,
						name: playerName.trim(),
						affiliation: null,
						character: null,
						is_alive: true
					}
				])
				.select()
				.single();

			if (error) {
				console.error('❌ Database error:', error);
				throw error;
			}

			console.log('✅ Player inserted successfully:', data);

			// Store player info
			currentPlayerId = playerId;
			localStorage.setItem('playerId', playerId);
			localStorage.setItem('playerName', playerName);

			// Send system message
			await gameStore.sendMessage(
				`${playerName} has joined the village!`,
				playerId,
				playerName,
				true
			);

			joinMessage = `Welcome to the village, ${playerName}!`;
			playerName = '';

			// Clear message after 3 seconds
			setTimeout(() => (joinMessage = ''), 3000);
		} catch (error: unknown) {
			console.error('💥 Join game error:', error);
			joinMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
		} finally {
			isJoining = false;
		}
	}

	// Check for game transition
	function checkForGameTransition() {
		// If game has started and we have a player ID, navigate to game board
		if (gameHasStarted && currentPlayerId) {
			const player = allPlayers.find((p) => p.id === currentPlayerId);
			if (player) {
				console.log('🎮 Game has started! Navigating to game board...');
				goto('/game'); // Adjust path as needed
			}
		}
	}

	// Watch for game state changes
	$: if (currentGameState) {
		checkForGameTransition();
	}

	// Initialize on mount
	onMount(() => {
		// Listen for phase changes
		const handlePhaseChange = (event: Event) => {
			const customEvent = event as CustomEvent;

			console.log('📢 Game phase changed:', customEvent.detail);
			const { newPhase, oldPhase } = customEvent.detail;

			if (oldPhase === 'lobby' && newPhase !== 'lobby') {
				joinMessage = '🌙 The game has begun! Redirecting...';
				setTimeout(() => checkForGameTransition(), 1000);
			}
		};

		window.addEventListener('gamePhaseChange', handlePhaseChange);

		// Run the async logic separately
		(async () => {
			await gameStore.initialize();

			const savedId = localStorage.getItem('playerId');
			const savedName = localStorage.getItem('playerName');

			if (savedId && savedName) {
				const currentPlayers = $players;

				const playerExists = currentPlayers.some((p) => p.id === savedId);
				if (playerExists) {
					currentPlayerId = savedId;
					console.log('🔄 Restored player session:', savedName);
					checkForGameTransition();
				} else {
					localStorage.removeItem('playerId');
					localStorage.removeItem('playerName');
					console.log('🗑️ Cleared invalid session for:', savedName);
				}
			}
		})();

		// Return a synchronous cleanup function only
		return () => {
			window.removeEventListener('gamePhaseChange', handlePhaseChange);
		};
	});

	// onMount(async () => {
	// 	// Initialize game store first
	// 	await gameStore.initialize();

	// 	// Now check for existing player after store is initialized
	// 	const savedId = localStorage.getItem('playerId');
	// 	const savedName = localStorage.getItem('playerName');

	// 	if (savedId && savedName) {
	// 		// Get current players from the store
	// 		const currentPlayers = $players;

	// 		// Verify player still exists
	// 		const playerExists = currentPlayers.some((p) => p.id === savedId);
	// 		if (playerExists) {
	// 			currentPlayerId = savedId;
	// 			console.log('🔄 Restored player session:', savedName);
	// 			// Check if should redirect to game
	// 			checkForGameTransition();
	// 		} else {
	// 			// Clear invalid session
	// 			localStorage.removeItem('playerId');
	// 			localStorage.removeItem('playerName');
	// 			console.log('🗑️ Cleared invalid session for:', savedName);
	// 		}
	// 	}

	// 	// Listen for phase changes
	// 	const handlePhaseChange = (event: CustomEvent) => {
	// 		console.log('📢 Game phase changed:', event.detail);
	// 		const { newPhase, oldPhase } = event.detail;

	// 		// Show join message about game starting
	// 		if (oldPhase === 'lobby' && newPhase !== 'lobby') {
	// 			joinMessage = '🌙 The game has begun! Redirecting...';
	// 			setTimeout(() => checkForGameTransition(), 1000);
	// 		}
	// 	};

	// 	window.addEventListener('gamePhaseChange', handlePhaseChange);

	// 	return () => {
	// 		window.removeEventListener('gamePhaseChange', handlePhaseChange);
	// 	};
	// });

	// Cleanup on destroy
	onDestroy(() => {
		gameStore.cleanup();
	});

	// Format time helper
	function formatJoinTime(timestamp: string): string {
		return new Date(timestamp).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Village of Shadows - Game Lobby</title>
</svelte:head>

<!-- Connection Status Bar -->
{#if connection !== 'connected'}
	<div class="connection-bar" class:error={connection === 'error'}>
		{#if connection === 'connecting'}
			🔄 Connecting to village...
		{:else if connection === 'error'}
			❌ Connection lost - please refresh
		{:else}
			⚠️ Disconnected from village
		{/if}
	</div>
{/if}

<!-- Game Container with Isolated Styles -->
<div class="game-container">
	<!-- Blood Particles -->
	<div class="blood-particles">
		<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
		{#each Array(5) as _, i (i)}
			<div class="blood-drop"></div>
		{/each}
	</div>

	<main class="container">
		<header>
			<div class="game-logo">
				<h1>VILLAGE OF SHADOWS</h1>
				<div class="game-subtitle">The Cult Awakens</div>
			</div>

			<button class="back-btn" on:click={() => goto('/')}> ← Return to Festival </button>
		</header>

		<!-- Join Game Section -->
		{#if !currentPlayerId}
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
							class:success={joinMessage.includes('Welcome') || joinMessage.includes('joined')}
							class:error={joinMessage.includes('Error') || joinMessage.includes('taken')}
							class:info={joinMessage.includes('🌙')}
						>
							{joinMessage}
						</div>
					{/if}
				</form>
			</section>
		{:else}
			<!-- Already Joined Message -->
			<section class="village-panel welcome-section">
				<h3>✨ You're in the Village</h3>
				<p class="welcome-text">
					Welcome back, {localStorage.getItem('playerName')}!
					{#if gameHasStarted}
						The game has begun...
					{:else}
						Waiting for the Storyteller to begin...
					{/if}
				</p>
				{#if gameHasStarted}
					<button class="cult-button" on:click={() => goto('/game')}> 🎮 Enter Game </button>
				{/if}
			</section>
		{/if}

		<!-- Villagers Gathered Section -->
		<section class="village-panel">
			<div class="lobby-header">
				<h3>👥 Villagers Gathered</h3>
				<div class="player-counter">
					<span class="count">{allPlayers.length}</span>
					{allPlayers.length === 1 ? 'soul' : 'souls'} in the village
				</div>
			</div>

			{#if allPlayers.length === 0}
				<div class="empty-lobby">
					<p>The village lies empty and silent...</p>
					<p class="whisper">Waiting for brave souls to arrive...</p>
				</div>
			{:else}
				<div class="players-grid">
					{#each allPlayers as player (player.id)}
						<div class="player-card" class:self={player.id === currentPlayerId}>
							<div class="player-avatar">
								{player.name.charAt(0).toUpperCase()}
							</div>
							<div class="player-info">
								<h4 class="player-name">
									{player.name}
									{#if player.id === currentPlayerId}
										<span class="you-badge">(You)</span>
									{/if}
								</h4>
								<p class="join-time">
									Arrived {formatJoinTime(player.joined_at)}
								</p>
								{#if player.affiliation && isGameActive}
									<p class="player-role">
										{player.character || 'Role assigned'}
									</p>
								{/if}
							</div>
							<div class="player-status">
								<span class="status-dot alive"></span>
							</div>
						</div>
					{/each}
				</div>

				<!-- Lobby Status -->
				<div class="lobby-status">
					{#if currentGameState?.status === 'lobby' || !currentGameState}
						<div class="waiting-message">
							<div class="status-indicator pulsing"></div>
							<div>
								<h4>Waiting for Storyteller</h4>
								<p>
									{#if allPlayers.length < 3}
										Need {3 - allPlayers.length} more {3 - allPlayers.length === 1
											? 'player'
											: 'players'} to start
									{:else}
										The game master will begin when ready... ({allPlayers.length} players ready)
									{/if}
								</p>
							</div>
						</div>
					{:else if isGameActive}
						<div class="starting-message">
							<div class="status-indicator starting"></div>
							<div>
								<h4>Game In Progress!</h4>
								<p>{currentGameState.current_phase}</p>
								{#if currentPlayerId}
									<p style="font-size: 0.8rem; margin-top: 0.5rem;">
										<a href="/game" style="color: #ff6b6b;">→ Join the game</a>
									</p>
								{/if}
							</div>
						</div>
					{:else if currentGameState?.status === 'finished'}
						<div class="finished-message">
							<div class="status-indicator finished"></div>
							<div>
								<h4>Game Over</h4>
								<p>The tale has ended... for now.</p>
							</div>
						</div>
					{/if}

					<!-- Admin Link -->
					<div class="admin-controls">
						<button class="admin-link-btn" on:click={() => goto('/admin')}>
							🎭 Storyteller Panel
						</button>
					</div>
				</div>
			{/if}
		</section>

		<!-- Recent Activity (showing recent join messages) -->
		{#if allMessages.length > 0}
			<section class="village-panel activity-panel">
				<h3>📜 Village Activity</h3>
				<div class="activity-list">
					{#each allMessages.slice(-5).reverse() as message (message.id)}
						{#if message.is_system && message.content.includes('joined')}
							<div class="activity-item">
								<span class="activity-time">
									{formatJoinTime(message.timestamp)}
								</span>
								<span class="activity-content">
									{message.content}
								</span>
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/if}
	</main>
</div>

<style>
	/* Connection Status Bar */
	.connection-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		background: rgba(59, 130, 246, 0.95);
		color: white;
		padding: 0.5rem;
		text-align: center;
		font-weight: 500;
		z-index: 1000;
		animation: slideDown 0.3s ease-out;
		backdrop-filter: blur(10px);
	}

	.connection-bar.error {
		background: rgba(239, 68, 68, 0.95);
	}

	@keyframes slideDown {
		from {
			transform: translateY(-100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	/* Main Game Container */
	.game-container {
		all: initial;
		display: block;
		background:
			radial-gradient(ellipse at top center, #1a1a2e 0%, #16213e 25%, #0f0f23 55%, #000000 100%),
			linear-gradient(135deg, #0a0a0f 0%, #1a1320 30%, #2d1b2e 60%, #1a0a1a 80%, #000000 100%);
		background-attachment: fixed;
		min-height: 100vh;
		position: relative;
		overflow-x: hidden;
		font-family: 'Georgia', 'Times New Roman', serif;
		color: #e2e8f0;
		box-sizing: border-box;
	}

	.game-container *,
	.game-container *::before,
	.game-container *::after {
		box-sizing: border-box;
	}

	/* Fog Effects */
	.game-container::before {
		content: '';
		position: fixed;
		bottom: -100px;
		left: -60%;
		width: 220%;
		height: 400px;
		background: radial-gradient(
			ellipse 80% 100% at center bottom,
			rgba(139, 137, 137, 0.08) 0%,
			transparent 70%
		);
		animation: creepingFog 30s ease-in-out infinite;
		pointer-events: none;
		z-index: 0;
		opacity: 0.6;
	}

	/* Blood Particles */
	.blood-particles {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 0;
		opacity: 0.7;
	}

	.blood-drop {
		position: absolute;
		width: 2px;
		height: 6px;
		background: radial-gradient(
			ellipse 100% 80%,
			rgba(139, 0, 0, 0.8) 0%,
			rgba(75, 0, 0, 0.4) 100%
		);
		border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
		animation: bloodFall 18s infinite linear;
		filter: blur(0.3px);
	}

	.blood-drop:nth-child(1) {
		left: 10%;
		animation-delay: 0s;
		animation-duration: 16s;
	}
	.blood-drop:nth-child(2) {
		left: 25%;
		animation-delay: -4s;
		animation-duration: 20s;
	}
	.blood-drop:nth-child(3) {
		left: 45%;
		animation-delay: -8s;
		animation-duration: 17s;
	}
	.blood-drop:nth-child(4) {
		left: 65%;
		animation-delay: -12s;
		animation-duration: 19s;
	}
	.blood-drop:nth-child(5) {
		left: 80%;
		animation-delay: -16s;
		animation-duration: 21s;
	}

	/* Main Container */
	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 2.5rem;
		position: relative;
		z-index: 1;
	}

	/* Header */
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.game-logo h1 {
		margin: 0;
		font-size: 2.5rem;
		font-weight: 900;
		letter-spacing: 0.05em;
		background: linear-gradient(135deg, #8b0000, #dc143c, #8b0000);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		text-shadow: 0 0 40px rgba(139, 0, 0, 0.6);
		animation: subtleGlow 4s ease-in-out infinite;
	}

	.game-subtitle {
		font-size: 1rem;
		color: #8b8680;
		font-style: italic;
		margin-top: 0.25rem;
	}

	.back-btn {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #cbd5e1;
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.3s ease;
		font-family: inherit;
	}

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.3);
		transform: translateY(-1px);
	}

	/* Village Panel */
	.village-panel {
		background:
			linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%),
			radial-gradient(circle at top left, rgba(139, 0, 0, 0.08) 0%, transparent 50%);
		backdrop-filter: blur(16px);
		border: 2px solid rgba(139, 0, 0, 0.25);
		border-radius: 20px;
		padding: 2.5rem;
		margin-bottom: 2rem;
		position: relative;
		overflow: hidden;
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
		transition: all 0.4s ease;
	}

	.village-panel h3 {
		color: #d4d4d8;
		font-family: 'Georgia', serif;
		font-size: 1.5rem;
		margin-bottom: 1.5rem;
	}

	/* Join Form */
	.join-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 400px;
		margin: 0 auto;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		color: #d4d4d8;
		font-weight: 600;
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
	}

	.dark-input:focus {
		outline: none;
		border-color: #8b0000;
		box-shadow: 0 0 15px rgba(139, 0, 0, 0.4);
		background: linear-gradient(135deg, rgba(139, 0, 0, 0.1), rgba(20, 20, 40, 0.9));
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
		position: relative;
		overflow: hidden;
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
		transform: none;
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

	/* Messages */
	.join-message {
		margin-top: 1rem;
		padding: 1rem;
		border-radius: 10px;
		text-align: center;
		font-weight: 600;
		animation: fadeIn 0.3s ease-out;
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

	/* Welcome Section */
	.welcome-section {
		text-align: center;
	}

	.welcome-text {
		color: #8b8680;
		margin-bottom: 1.5rem;
		font-size: 1.1rem;
	}

	/* Players Grid */
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

	.players-grid {
		display: grid;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.player-card {
		background: linear-gradient(135deg, rgba(0, 0, 0, 0.6), rgba(20, 20, 40, 0.8));
		border: 1px solid rgba(139, 0, 0, 0.3);
		border-radius: 15px;
		padding: 1.5rem;
		transition: all 0.4s ease;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.player-card.self {
		border-color: rgba(59, 130, 246, 0.5);
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(20, 20, 40, 0.8));
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
		font-size: 1.1rem;
	}

	.you-badge {
		font-size: 0.8rem;
		color: #60a5fa;
		font-weight: normal;
		margin-left: 0.5rem;
	}

	.join-time {
		margin: 0;
		color: #8b8680;
		font-size: 0.9rem;
	}

	.player-role {
		font-size: 0.8rem;
		color: #8b8680;
		margin: 0.25rem 0 0 0;
		font-style: italic;
	}

	.status-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #32cd32;
		box-shadow: 0 0 8px rgba(50, 205, 50, 0.5);
	}

	/* Lobby Status */
	.lobby-status {
		margin-top: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: center;
	}

	.waiting-message,
	.starting-message,
	.finished-message {
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

	.finished-message {
		background: linear-gradient(135deg, rgba(75, 75, 75, 0.2), rgba(0, 0, 0, 0.6));
		border: 2px solid rgba(75, 75, 75, 0.4);
		color: #9ca3af;
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

	.status-indicator.finished {
		background: #4b4b4b;
	}

	/* Activity Panel */
	.activity-panel {
		max-height: 200px;
		overflow-y: auto;
	}

	.activity-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.activity-item {
		display: flex;
		gap: 1rem;
		padding: 0.5rem;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		font-size: 0.9rem;
	}

	.activity-time {
		color: #8b8680;
		flex-shrink: 0;
	}

	.activity-content {
		color: #d4d4d8;
	}

	/* Admin Controls */
	.admin-controls {
		margin-top: 1rem;
	}

	.admin-link-btn,
	.clear-lobby-btn {
		padding: 0.7rem 1.2rem;
		font-size: 0.85rem;
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
