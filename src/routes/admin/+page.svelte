<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import {
		gameStore,
		players,
		gameState,
		connectionStatus,
		playersByAffiliation,
		alivePlayers
	} from '$lib/stores/gameState';

	// Local state for UI
	let adminMessage = '';
	let isProcessing = false;

	// Subscribe to store values
	$: allPlayers = $players;
	$: currentGameState = $gameState;
	$: connection = $connectionStatus;
	$: ({ cult, townsfolk } = $playersByAffiliation);
	$: aliveCount = $alivePlayers.length;

	// Admin functions with better state management
	async function startGame() {
		if (allPlayers.length < 3) {
			adminMessage = 'Need at least 3 players to start the game';
			return;
		}

		if (isProcessing) return;

		isProcessing = true;
		adminMessage = 'Initializing game and assigning roles...';

		try {
			const { error } = await supabase.rpc('start_game_simple');

			if (error) throw error;

			adminMessage = '✅ Game started! Roles assigned.';

			// The store will automatically update via subscriptions
		} catch (error) {
			console.error('Error starting game:', error);
			adminMessage = `❌ Error starting game: ${error || 'Unknown error'}`;
		} finally {
			isProcessing = false;
			// Clear message after 3 seconds
			setTimeout(() => (adminMessage = ''), 3000);
		}
	}

	async function resetGame() {
		const confirmMessage = `⚠️ RESET ENTIRE GAME ⚠️\n\nThis will:\n• Remove all ${allPlayers.length} players\n• Reset status from "${currentGameState?.status || 'unknown'}" to "lobby"\n• Clear all roles\n\nContinue?`;

		if (!confirm(confirmMessage)) return;
		if (isProcessing) return;

		isProcessing = true;
		adminMessage = 'Resetting entire game...';

		try {
			const { error } = await supabase.rpc('reset_game_simple');

			if (error) throw error;

			adminMessage = '✅ Game reset completed!';
		} catch (error) {
			console.error('Error resetting game:', error);
			adminMessage = `❌ Error resetting game: ${error || 'Unknown error'}`;
		} finally {
			isProcessing = false;
			setTimeout(() => (adminMessage = ''), 3000);
		}
	}

	async function resetPlayersOnly() {
		if (allPlayers.length === 0) {
			adminMessage = 'No players to remove';
			return;
		}

		const confirmMessage = `Remove all ${allPlayers.length} players but keep game state?\n\nThis will:\n• Remove all players from the game\n• Keep current game status: "${currentGameState?.status || 'unknown'}"\n• Keep current phase: "${currentGameState?.current_phase || 'unknown'}"\n\nContinue?`;

		if (!confirm(confirmMessage)) return;

		isProcessing = true;
		adminMessage = 'Removing all players...';

		try {
			const { error } = await supabase
				.from('game_players')
				.delete()
				.neq('id', '00000000-0000-0000-0000-000000000000');

			if (error) throw error;

			adminMessage = `✅ All ${allPlayers.length} players removed!`;
		} catch (error) {
			console.error('Error removing players:', error);
			adminMessage = `❌ Error removing players: ${error || 'Unknown error'}`;
		} finally {
			isProcessing = false;
			setTimeout(() => (adminMessage = ''), 3000);
		}
	}

	async function forceGameState(newStatus: 'lobby' | 'night' | 'day' | 'voting' | 'finished') {
		if (!confirm(`Force change game status to "${newStatus}"?`)) return;

		isProcessing = true;
		adminMessage = `Forcing game state to ${newStatus}...`;

		try {
			let newPhase: string;
			let newDay = currentGameState?.day_number || 1;

			switch (newStatus) {
				case 'lobby':
					newPhase = 'Lobby - Waiting for Players';
					newDay = 0;
					break;
				case 'night':
					newPhase = `Night ${newDay} - The Cult Strikes`;
					break;
				case 'day':
					newPhase = `Day ${newDay} - Village Discussion`;
					break;
				case 'voting':
					newPhase = `Day ${newDay} - Execution Vote`;
					break;
				case 'finished':
					newPhase = 'Game Over';
					break;
			}

			const { error } = await supabase
				.from('game_state')
				.update({
					status: newStatus,
					current_phase: newPhase,
					day_number: newDay,
					updated_at: new Date().toISOString()
				})
				.eq('id', 1);

			if (error) throw error;

			adminMessage = `✅ Game state forced to: ${newStatus}`;
		} catch (error) {
			console.error('Error forcing game state:', error);
			adminMessage = `❌ Error: ${error || 'Unknown error'}`;
		} finally {
			isProcessing = false;
			setTimeout(() => (adminMessage = ''), 3000);
		}
	}

	async function removePlayer(playerId: string, playerName: string) {
		if (!confirm(`Remove ${playerName} from the game?`)) return;

		try {
			await gameStore.removePlayer(playerId);
			adminMessage = `${playerName} removed from game`;
			setTimeout(() => (adminMessage = ''), 3000);
		} catch (error) {
			console.error('Error removing player:', error);
			adminMessage = `Error removing player: ${error}`;
		}
	}

	async function togglePlayerLife(playerId: string, playerName: string, isAlive: boolean) {
		try {
			await gameStore.updatePlayer(playerId, { is_alive: !isAlive });
			adminMessage = `${playerName} is now ${!isAlive ? 'alive' : 'dead'}`;
			setTimeout(() => (adminMessage = ''), 3000);
		} catch (error) {
			console.error('Error toggling player life:', error);
			adminMessage = `Error: ${error}`;
		}
	}

	// Helper functions for styling
	function getGameStatusColor(status: 'lobby' | 'night' | 'day' | 'voting' | 'finished') {
		const colors = {
			lobby: '#6b7280',
			night: '#4338ca',
			day: '#f59e0b',
			voting: '#dc2626',
			finished: '#059669'
		};
		return colors[status] || '#6b7280';
	}

	function getRoleColor(affiliation: 'cult' | 'townsfolk') {
		const colors = {
			cult: '#dc2626',
			townsfolk: '#059669'
		};
		return colors[affiliation] || '#6b7280';
	}

	// Initialize store on mount
	onMount(() => {
		const initializeAndListen = async () => {
			await gameStore.initialize();
		};

		initializeAndListen();

		// Listen for phase changes
		const handlePhaseChange = (event: Event) => {
			const customEvent = event as CustomEvent;
			console.log('Game phase changed:', customEvent.detail);
			adminMessage = `📢 Phase changed to: ${customEvent.detail.newPhase}`;
			setTimeout(() => (adminMessage = ''), 3000);
		};

		window.addEventListener('gamePhaseChange' as keyof WindowEventMap, handlePhaseChange);

		return () => {
			window.removeEventListener('gamePhaseChange' as keyof WindowEventMap, handlePhaseChange);
		};
	});

	// Cleanup on destroy
	onDestroy(() => {
		gameStore.cleanup();
	});
</script>

<svelte:head>
	<title>Storyteller Control - Village of Shadows</title>
</svelte:head>

<!-- Connection Status Indicator -->
{#if connection !== 'connected'}
	<div class="connection-status" class:error={connection === 'error'}>
		{#if connection === 'connecting'}
			🔄 Connecting to game server...
		{:else if connection === 'error'}
			❌ Connection error - please refresh
		{:else}
			⚠️ Disconnected from server
		{/if}
	</div>
{/if}

{#if adminMessage}
	<div class="admin-message" class:error={adminMessage.includes('❌')}>
		{adminMessage}
	</div>
{/if}

<!-- Clean Admin Container -->
<div class="admin-container">
	<main class="admin-main">
		<header class="admin-header">
			<div class="header-content">
				<h1 class="admin-title">🎭 Storyteller Control</h1>
				<p class="admin-subtitle">Master of the Village's Fate</p>
			</div>

			<nav class="admin-nav">
				<button class="nav-btn secondary" on:click={() => goto('/whispers')}>
					← Player Lobby
				</button>
				<button class="nav-btn secondary" on:click={() => goto('/')}> ← Festival </button>
			</nav>
		</header>

		<!-- Game Controls Section -->
		<section class="admin-panel">
			<h2 class="panel-title">🎛️ Game Controls</h2>

			<div class="control-section">
				{#if !currentGameState || currentGameState.status === 'lobby'}
					<!-- Start Game Button -->
					<button
						class="control-btn primary large"
						on:click={startGame}
						disabled={isProcessing || allPlayers.length < 3}
					>
						{#if isProcessing}
							<span class="btn-icon">⏳</span>
							Starting Game...
						{:else if allPlayers.length < 3}
							<span class="btn-icon">👥</span>
							Need {3 - allPlayers.length} More Players
						{:else}
							<span class="btn-icon">🌙</span>
							Start Game ({allPlayers.length} players)
						{/if}
					</button>
				{:else}
					<!-- Game Active Status -->
					<div class="game-status-active">
						<div
							class="status-indicator"
							style="background-color: {getGameStatusColor(currentGameState.status)}"
						></div>
						<div>
							<h3>Game Running</h3>
							<p>Status: <strong>{currentGameState.status.toUpperCase()}</strong></p>
							<p>Phase: <strong>{currentGameState.current_phase}</strong></p>
							<p>Day: <strong>{currentGameState.day_number}</strong></p>
						</div>
					</div>

					<!-- Phase Control Buttons -->
					<div class="phase-controls">
						<button
							class="control-btn secondary"
							on:click={() => forceGameState('night')}
							disabled={isProcessing}
						>
							<span class="btn-icon">🌙</span>
							Force Night Phase
						</button>

						<button
							class="control-btn secondary"
							on:click={() => forceGameState('day')}
							disabled={isProcessing}
						>
							<span class="btn-icon">☀️</span>
							Force Day Phase
						</button>

						<button
							class="control-btn secondary"
							on:click={() => forceGameState('voting')}
							disabled={isProcessing}
						>
							<span class="btn-icon">🗳️</span>
							Force Voting Phase
						</button>
					</div>
				{/if}

				<!-- Reset Controls -->
				<div class="reset-controls">
					<h4>⚠️ Reset Options</h4>

					<div class="reset-buttons">
						<button class="control-btn danger" on:click={resetGame} disabled={isProcessing}>
							<span class="btn-icon">🔄</span>
							Full Game Reset
						</button>

						<button
							class="control-btn warning"
							on:click={resetPlayersOnly}
							disabled={isProcessing || allPlayers.length === 0}
						>
							<span class="btn-icon">👥</span>
							Clear Players Only
						</button>

						<button
							class="control-btn info"
							on:click={() => forceGameState('lobby')}
							disabled={isProcessing}
						>
							<span class="btn-icon">🏠</span>
							Force Lobby State
						</button>
					</div>
				</div>

				<!-- Debug Controls -->
				<div class="debug-controls">
					<h4>🔧 Debug Tools</h4>

					<div class="debug-buttons">
						<button
							class="control-btn debug"
							on:click={() => gameStore.refresh()}
							disabled={isProcessing}
						>
							<span class="btn-icon">🔄</span>
							Reload Data
						</button>

						<button class="control-btn debug" on:click={() => goto('/game')}>
							<span class="btn-icon">🎮</span>
							Go to Game Board
						</button>
					</div>
				</div>
			</div>
		</section>

		<!-- Players Management -->
		<section class="admin-panel">
			<div class="panel-header">
				<h2 class="panel-title">👥 Players Management</h2>
				{#if allPlayers.length > 0}
					<div class="quick-stats">
						<span class="stat cult">Cult: {cult.length}</span>
						<span class="stat townsfolk">Townsfolk: {townsfolk.length}</span>
						<span class="stat alive">Alive: {aliveCount}</span>
					</div>
				{/if}
			</div>

			{#if allPlayers.length === 0}
				<div class="empty-state">
					<div class="empty-icon">👥</div>
					<h3>No players yet</h3>
					<p>Players can join at <a href="/game" target="_blank" class="game-link">/game</a></p>
				</div>
			{:else}
				<div class="players-grid">
					{#each allPlayers as player (player.id)}
						<div class="player-card" class:dead={!player.is_alive}>
							<div class="player-header">
								<div class="player-avatar" class:dead={!player.is_alive}>
									{player.name.charAt(0).toUpperCase()}
								</div>
								<div class="player-info">
									<h4 class="player-name">{player.name}</h4>
									<p class="player-time">
										Joined {new Date(player.joined_at).toLocaleTimeString()}
									</p>
								</div>
								<div class="player-status">
									<div
										class="status-dot"
										class:alive={player.is_alive}
										class:dead={!player.is_alive}
									></div>
								</div>
							</div>

							<div class="player-role">
								{#if player.affiliation || player.character}
									<div class="role-info">
										{#if player.affiliation}
											<span
												class="role-badge"
												style="background-color: {getRoleColor(player.affiliation)}"
											>
												{player.affiliation.toUpperCase()}
											</span>
										{/if}
										{#if player.character}
											<span class="character-name">{player.character}</span>
										{/if}
									</div>
								{:else}
									<span class="no-role">Role not assigned</span>
								{/if}
							</div>

							<div class="player-actions">
								<button
									class="action-btn"
									class:kill={player.is_alive}
									class:revive={!player.is_alive}
									on:click={() => togglePlayerLife(player.id, player.name, player.is_alive)}
								>
									{player.is_alive ? '💀' : '✨'}
									{player.is_alive ? 'Kill' : 'Revive'}
								</button>
								<button
									class="action-btn remove"
									on:click={() => removePlayer(player.id, player.name)}
								>
									🗑️ Remove
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	</main>
</div>

<style>
	/* Connection Status */
	.connection-status {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		background: rgba(59, 130, 246, 0.9);
		color: white;
		padding: 0.5rem;
		text-align: center;
		font-weight: 500;
		z-index: 1000;
		animation: slideDown 0.3s ease-out;
	}

	.connection-status.error {
		background: rgba(239, 68, 68, 0.9);
	}

	/* Admin Message */
	.admin-message {
		position: fixed;
		top: 50px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(5, 150, 105, 0.95);
		color: white;
		padding: 1rem 2rem;
		border-radius: 8px;
		font-weight: 500;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
		z-index: 999;
		animation: slideDown 0.3s ease-out;
	}

	.admin-message.error {
		background: rgba(239, 68, 68, 0.95);
	}

	@keyframes slideDown {
		from {
			transform: translate(-50%, -100%);
			opacity: 0;
		}
		to {
			transform: translate(-50%, 0);
			opacity: 1;
		}
	}

	/* Reset Controls */
	.reset-controls h4,
	.debug-controls h4 {
		color: #f8fafc;
		margin: 1.5rem 0 1rem 0;
		font-size: 1.1rem;
	}

	/* Phase Controls */
	.phase-controls {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.reset-buttons,
	.debug-buttons {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.5rem;
	}

	/* Additional button styles */
	.control-btn.secondary {
		background: linear-gradient(135deg, #475569, #64748b);
		color: white;
	}

	.control-btn.secondary:hover:not(:disabled) {
		background: linear-gradient(135deg, #334155, #475569);
	}

	.control-btn.warning {
		background: linear-gradient(135deg, #f59e0b, #fbbf24);
		color: white;
	}

	.control-btn.warning:hover:not(:disabled) {
		background: linear-gradient(135deg, #d97706, #f59e0b);
	}

	.control-btn.info {
		background: linear-gradient(135deg, #3b82f6, #60a5fa);
		color: white;
	}

	.control-btn.info:hover:not(:disabled) {
		background: linear-gradient(135deg, #2563eb, #3b82f6);
	}

	.control-btn.debug {
		background: linear-gradient(135deg, #8b5cf6, #a78bfa);
		color: white;
	}

	.control-btn.debug:hover:not(:disabled) {
		background: linear-gradient(135deg, #7c3aed, #8b5cf6);
	}

	/* Rest of the styles remain the same as in the original */
	.admin-container {
		all: initial;
		display: block;
		background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
		min-height: 100vh;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
		color: #f8fafc;
		line-height: 1.6;
		box-sizing: border-box;
	}

	.admin-container *,
	.admin-container *::before,
	.admin-container *::after {
		box-sizing: border-box;
	}

	.admin-main {
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem;
	}

	.admin-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 3rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.header-content h1 {
		margin: 0;
		font-size: 2.5rem;
		font-weight: 800;
		background: linear-gradient(135deg, #60a5fa, #a78bfa, #f472b6);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.admin-subtitle {
		margin: 0.5rem 0 0 0;
		color: #94a3b8;
		font-size: 1.1rem;
		font-weight: 500;
	}

	.admin-nav {
		display: flex;
		gap: 0.75rem;
	}

	.nav-btn {
		padding: 0.75rem 1.5rem;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.05);
		color: #f8fafc;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		text-decoration: none;
		display: inline-block;
	}

	.nav-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.3);
		transform: translateY(-1px);
	}

	.nav-btn.secondary {
		border-color: rgba(148, 163, 184, 0.3);
		color: #cbd5e1;
	}

	.admin-panel {
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 2rem;
		margin-bottom: 2rem;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
	}

	.panel-title {
		margin: 0 0 1.5rem 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: #f8fafc;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.control-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.control-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem 2rem;
		border: none;
		border-radius: 10px;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s ease;
		min-height: 48px;
	}

	.control-btn.primary {
		background: linear-gradient(135deg, #059669, #10b981);
		color: white;
	}

	.control-btn.primary:hover:not(:disabled) {
		background: linear-gradient(135deg, #047857, #059669);
		transform: translateY(-2px);
		box-shadow: 0 8px 25px rgba(5, 150, 105, 0.3);
	}

	.control-btn.danger {
		background: linear-gradient(135deg, #dc2626, #ef4444);
		color: white;
	}

	.control-btn.danger:hover:not(:disabled) {
		background: linear-gradient(135deg, #b91c1c, #dc2626);
		transform: translateY(-2px);
		box-shadow: 0 8px 25px rgba(220, 38, 38, 0.3);
	}

	.control-btn.large {
		padding: 1.5rem 3rem;
		font-size: 1.125rem;
	}

	.control-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.btn-icon {
		font-size: 1.25rem;
	}

	.game-status-active {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem;
		background: rgba(5, 150, 105, 0.1);
		border: 1px solid rgba(5, 150, 105, 0.2);
		border-radius: 12px;
		color: #10b981;
	}

	.status-indicator {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		animation: pulse 2s infinite;
	}

	.game-status-active h3 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.game-status-active p {
		margin: 0.25rem 0 0 0;
		opacity: 0.8;
	}

	.quick-stats {
		display: flex;
		gap: 1rem;
	}

	.stat {
		padding: 0.375rem 0.75rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.stat.cult {
		background: rgba(220, 38, 38, 0.1);
		color: #ef4444;
		border: 1px solid rgba(220, 38, 38, 0.2);
	}

	.stat.townsfolk {
		background: rgba(5, 150, 105, 0.1);
		color: #10b981;
		border: 1px solid rgba(5, 150, 105, 0.2);
	}

	.stat.alive {
		background: rgba(59, 130, 246, 0.1);
		color: #60a5fa;
		border: 1px solid rgba(59, 130, 246, 0.2);
	}

	.empty-state {
		text-align: center;
		padding: 3rem 2rem;
		color: #94a3b8;
	}

	.empty-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
		opacity: 0.5;
	}

	.empty-state h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: #cbd5e1;
	}

	.empty-state p {
		margin: 0;
	}

	.game-link {
		color: #60a5fa;
		text-decoration: none;
		font-weight: 600;
	}

	.game-link:hover {
		text-decoration: underline;
	}

	.players-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1rem;
	}

	.player-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1.5rem;
		transition: all 0.2s ease;
	}

	.player-card:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
		transform: translateY(-2px);
	}

	.player-card.dead {
		opacity: 0.6;
		background: rgba(220, 38, 38, 0.05);
		border-color: rgba(220, 38, 38, 0.2);
	}

	.player-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.player-avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: linear-gradient(135deg, #60a5fa, #a78bfa);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 1.125rem;
		color: white;
	}

	.player-avatar.dead {
		background: linear-gradient(135deg, #6b7280, #9ca3af);
	}

	.player-info {
		flex: 1;
	}

	.player-name {
		margin: 0 0 0.25rem 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: #f8fafc;
	}

	.player-time {
		margin: 0;
		font-size: 0.875rem;
		color: #94a3b8;
	}

	.player-status {
		display: flex;
		align-items: center;
	}

	.status-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	.status-dot.alive {
		background: #10b981;
		box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
	}

	.status-dot.dead {
		background: #ef4444;
		box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
	}

	.player-role {
		margin-bottom: 1rem;
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
		text-align: center;
	}

	.role-info {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.role-badge {
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 700;
		color: white;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.character-name {
		font-style: italic;
		color: #cbd5e1;
		font-weight: 500;
	}

	.no-role {
		color: #6b7280;
		font-style: italic;
		font-size: 0.875rem;
	}

	.player-actions {
		display: flex;
		gap: 0.5rem;
	}

	.action-btn {
		flex: 1;
		padding: 0.5rem 1rem;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.05);
		color: #f8fafc;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		min-height: 36px;
	}

	.action-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		transform: translateY(-1px);
	}

	.action-btn.kill {
		border-color: rgba(239, 68, 68, 0.3);
		color: #fca5a5;
	}

	.action-btn.kill:hover {
		background: rgba(239, 68, 68, 0.1);
		border-color: rgba(239, 68, 68, 0.5);
	}

	.action-btn.revive {
		border-color: rgba(16, 185, 129, 0.3);
		color: #6ee7b7;
	}

	.action-btn.revive:hover {
		background: rgba(16, 185, 129, 0.1);
		border-color: rgba(16, 185, 129, 0.5);
	}

	.action-btn.remove {
		border-color: rgba(107, 114, 128, 0.3);
		color: #d1d5db;
	}

	.action-btn.remove:hover {
		background: rgba(107, 114, 128, 0.1);
		border-color: rgba(107, 114, 128, 0.5);
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	/* Responsive Design */
	@media (max-width: 768px) {
		.admin-main {
			padding: 1rem;
		}

		.admin-header {
			flex-direction: column;
			gap: 1rem;
			align-items: stretch;
		}

		.admin-nav {
			justify-content: stretch;
		}

		.nav-btn {
			flex: 1;
			text-align: center;
		}

		.players-grid {
			grid-template-columns: 1fr;
		}

		.quick-stats {
			flex-direction: column;
			gap: 0.5rem;
		}

		.panel-header {
			flex-direction: column;
			gap: 1rem;
			align-items: stretch;
		}

		.phase-controls {
			grid-template-columns: 1fr;
		}

		.control-btn.large {
			padding: 1.25rem 2rem;
			font-size: 1rem;
		}
	}

	@media (max-width: 480px) {
		.admin-main {
			padding: 0.75rem;
		}

		.admin-panel {
			padding: 1.5rem;
		}

		.header-content h1 {
			font-size: 2rem;
		}

		.admin-subtitle {
			font-size: 1rem;
		}

		.control-btn {
			padding: 0.875rem 1.5rem;
			font-size: 0.9rem;
		}

		.control-btn.large {
			padding: 1rem 1.5rem;
			font-size: 0.95rem;
		}

		.player-card {
			padding: 1rem;
		}

		.player-avatar {
			width: 40px;
			height: 40px;
			font-size: 1rem;
		}

		.action-btn {
			padding: 0.5rem 0.75rem;
			font-size: 0.8rem;
			min-height: 32px;
		}

		.panel-title {
			font-size: 1.25rem;
		}

		.btn-icon {
			font-size: 1.1rem;
		}

		.player-actions {
			flex-direction: column;
		}

		.player-role {
			padding: 0.5rem;
		}

		.role-badge {
			font-size: 0.7rem;
		}

		.character-name {
			font-size: 0.875rem;
		}
	}
</style>
