<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { goto } from '$app/navigation'
  import { supabase } from '$lib/supabase'
	import type { RealtimeChannel } from '@supabase/supabase-js';

  interface GamePlayer {
    id: string
    name: string
    affiliation: 'cult' | 'townsfolk' | null
    character: string | null
    joined_at: string
    is_alive: boolean
  }

  interface GameState {
    id: number
    status: 'lobby' | 'night' | 'day' | 'voting' | 'finished'
    current_phase: string
    day_number: number
    created_at: string
    updated_at: string
  }

  let players: GamePlayer[] = []
  let gameState: GameState | null = null
  let adminMessage = ''
  let isProcessing = false
  let subscription: RealtimeChannel | null = null

  // Game controls
  // let selectedPlayers: string[] = []

  async function loadGameData() {
  try {
    // Load players
    const { data: playersData, error: playersError } = await supabase
      .from('game_players')
      .select('*')
      .order('joined_at', { ascending: true })

    if (playersError) throw new Error(`Players error: ${playersError.message}`)
    players = playersData ?? []

    // Load game state
    const { data: stateData, error: stateError } = await supabase
      .from('game_state')
      .select('*')
      .single()

    if (stateError) {
      // Ignore specific "no rows" error (code PGRST116 or message with "Results contain 0 rows")
      if (stateError.code !== 'PGRST116' && !stateError.message.includes('Results contain 0 rows')) {
        throw new Error(`Game state error: ${stateError.message}`)
      }
    }

    gameState = stateData ?? null

  } catch (error: unknown) {
    console.error('Error loading game data:', error)
    adminMessage = `Error loading data: ${error ?? 'Unknown error'}`
  }
}


  async function startGame() {
    if (players.length < 3) {
      adminMessage = 'Need at least 3 players to start the game'
      return
    }

    isProcessing = true
    adminMessage = 'Starting game and assigning roles...'

    try {
      // Call the start_game function we'll create
      const { error } = await supabase.rpc('start_game_simple')
      
      if (error) throw error

      adminMessage = 'Game started successfully! Roles have been assigned.'
      await loadGameData()
      
    } catch (error: unknown) {
      console.error('Error starting game:', error)
      adminMessage = `Error starting game: ${error}`
    } finally {
      isProcessing = false
    }
  }

  //   function handlePhaseNavigation() {
  //   if (!gameState) return;

  //   // Navigate on first phase transition
  //   if (gameState.status === 'night' || gameState.status === 'day' || gameState.status === 'voting') {
  //     goto('/game'); // Adjust if your board route is different
  //   }
  // }


  async function resetGame() {
    if (!confirm('Are you sure you want to reset the entire game? This will clear all players and progress.')) {
      return
    }

    isProcessing = true
    adminMessage = 'Resetting game...'

    try {
      const { error } = await supabase.rpc('reset_game_simple')
      
      if (error) throw error

      adminMessage = 'Game reset successfully!'
      await loadGameData()
      
    } catch (error: unknown) {
      console.error('Error resetting game:', error)
      adminMessage = `Error resetting game: ${error}`
    } finally {
      isProcessing = false
    }
  }

  async function removePlayer(playerId: string, playerName: string) {
    if (!confirm(`Remove ${playerName} from the game?`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('game_players')
        .delete()
        .eq('id', playerId)

      if (error) throw error

      adminMessage = `${playerName} removed from game`
      await loadGameData()
      
    } catch (error: unknown) {
      console.error('Error removing player:', error)
      adminMessage = `Error removing player: ${error}`
    }
  }

  async function togglePlayerLife(playerId: string, playerName: string, isAlive: boolean) {
    try {
      const { error } = await supabase
        .from('game_players')
        .update({ is_alive: !isAlive })
        .eq('id', playerId)

      if (error) throw error

      adminMessage = `${playerName} is now ${!isAlive ? 'alive' : 'dead'}`
      await loadGameData()
      
    } catch (error: unknown) {
      console.error('Error toggling player life:', error)
      adminMessage = `Error: ${error}`
    }
  }

  function getGameStatusColor(status: string) {
    switch (status) {
      case 'lobby': return '#6b7280'
      case 'night': return '#4338ca'
      case 'day': return '#f59e0b'
      case 'voting': return '#dc2626'
      case 'finished': return '#059669'
      default: return '#6b7280'
    }
  }

  function getRoleColor(affiliation: string | null) {
    switch (affiliation) {
      case 'cult': return '#dc2626'
      case 'townsfolk': return '#059669'
      default: return '#6b7280'
    }
  }

  onMount(() => {
    loadGameData()

    // Set up real-time subscription
    subscription = supabase
      .channel('admin_channel')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'game_players' },
        () => loadGameData()
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'game_state' },
        () => loadGameData()
      )
      .subscribe()
  })

  onDestroy(() => {
    if (subscription) {
      supabase.removeChannel(subscription)
    }
  })
</script>

<svelte:head>
  <title>Storyteller Control - Village of Shadows</title>
</svelte:head>

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
        <button class="nav-btn secondary" on:click={() => goto('/')}>
          ← Festival
        </button>
      </nav>
    </header>

    <!-- Game Status Overview -->
    <section class="admin-panel">
      <h2 class="panel-title">🎮 Game Overview</h2>
      
      {#if gameState}
        <div class="status-grid">
          <div class="status-card">
            <label class="status-label">Status</label>
            <span class="status-badge" style="background-color: {getGameStatusColor(gameState.status)}">
              {gameState.status.toUpperCase()}
            </span>
          </div>
          <div class="status-card">
            <label class="status-label">Phase</label>
            <span class="status-value">{gameState.current_phase}</span>
          </div>
          <div class="status-card">
            <label class="status-label">Day</label>
            <span class="status-value">{gameState.day_number}</span>
          </div>
          <div class="status-card">
            <label class="status-label">Players</label>
            <span class="status-value">{players.length} total, {players.filter(p => p.is_alive).length} alive</span>
          </div>
        </div>
      {:else}
        <div class="alert warning">
          <span class="alert-icon">⚠️</span>
          <span>No game state found. Game may need to be initialized.</span>
        </div>
      {/if}

      {#if adminMessage}
        <div class="alert info">
          <span class="alert-icon">ℹ️</span>
          <span>{adminMessage}</span>
        </div>
      {/if}
    </section>

    <!-- Game Controls -->
    <section class="admin-panel">
      <h2 class="panel-title">🎛️ Game Controls</h2>
      
      <div class="control-section">
        {#if !gameState || gameState.status === 'lobby'}
          <button 
            class="control-btn primary large" 
            on:click={startGame}
            disabled={isProcessing || players.length < 3}
          >
            {#if isProcessing}
              <span class="btn-icon">⏳</span>
              Starting Game...
            {:else if players.length < 3}
              <span class="btn-icon">👥</span>
              Need {3 - players.length} More Players
            {:else}
              <span class="btn-icon">🌙</span>
              Start Game ({players.length} players)
            {/if}
          </button>
        {:else}
          <div class="game-status-active">
            <div class="status-indicator" style="background-color: {getGameStatusColor(gameState.status)}"></div>
            <div>
              <h3>Game Running</h3>
              <p>Currently in <strong>{gameState.status}</strong> phase</p>
            </div>
          </div>
        {/if}

        <button 
          class="control-btn danger" 
          on:click={resetGame}
          disabled={isProcessing}
        >
          <span class="btn-icon">🔄</span>
          Reset Game
        </button>
      </div>
    </section>

    <!-- Players Management -->
    <section class="admin-panel">
      <div class="panel-header">
        <h2 class="panel-title">👥 Players Management</h2>
        {#if players.length > 0}
          <div class="quick-stats">
            <span class="stat cult">Cult: {players.filter(p => p.affiliation === 'cult').length}</span>
            <span class="stat townsfolk">Townsfolk: {players.filter(p => p.affiliation === 'townsfolk').length}</span>
            <span class="stat alive">Alive: {players.filter(p => p.is_alive).length}</span>
          </div>
        {/if}
      </div>
      
      {#if players.length === 0}
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <h3>No players yet</h3>
          <p>Players can join at <a href="/game" target="_blank" class="game-link">/game</a></p>
        </div>
      {:else}
        <div class="players-grid">
          {#each players as player (player.id)}
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
                  <div class="status-dot" class:alive={player.is_alive} class:dead={!player.is_alive}></div>
                </div>
              </div>

              <div class="player-role">
                {#if player.affiliation || player.character}
                  <div class="role-info">
                    {#if player.affiliation}
                      <span class="role-badge" style="background-color: {getRoleColor(player.affiliation)}">
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
  /* ==========================================================================
     CLEAN ADMIN PANEL - COMPONENT SCOPED STYLES
     ========================================================================== */

  /* Admin Container - Isolates from festival styles */
  .admin-container {
    /* Reset any inherited styles */
    all: initial;
    display: block;
    
    /* Clean, professional admin theme */
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
    color: #f8fafc;
    line-height: 1.6;
    box-sizing: border-box;
  }

  /* Ensure all elements use border-box */
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

  /* Header */
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

  /* Panels */
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

  /* Status Grid */
  .status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .status-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 1.5rem;
    text-align: center;
  }

  .status-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    color: #94a3b8;
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-badge {
    display: inline-block;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 700;
    color: white;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-value {
    font-size: 1.125rem;
    font-weight: 600;
    color: #f8fafc;
  }

  /* Alerts */
  .alert {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    border-radius: 8px;
    margin-top: 1rem;
    font-weight: 500;
  }

  .alert.warning {
    background: rgba(251, 191, 36, 0.1);
    border: 1px solid rgba(251, 191, 36, 0.2);
    color: #fbbf24;
  }

  .alert.info {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  .alert-icon {
    font-size: 1.25rem;
  }

  /* Control Section */
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

  /* Quick Stats */
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

  /* Empty State */
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

  /* Players Grid */
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

  /* Animations */
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Loading states */
  .loading {
    pointer-events: none;
    opacity: 0.7;
  }

  .loading::after {
    content: '';
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-left: 0.5rem;
  }

  /* Focus states for accessibility */
  .nav-btn:focus,
  .control-btn:focus,
  .action-btn:focus {
    outline: 2px solid #60a5fa;
    outline-offset: 2px;
  }

  /* Smooth transitions for state changes */
  .player-card,
  .status-card,
  .admin-panel {
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Enhanced hover effects */
  .admin-panel:hover {
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  }

  .status-card:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
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

    .status-grid {
      grid-template-columns: 1fr;
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

  /* Print styles */
  @media print {
    .admin-container {
      background: white;
      color: black;
    }

    .nav-btn,
    .control-btn,
    .action-btn {
      display: none;
    }

    .admin-panel {
      break-inside: avoid;
      border: 1px solid #ddd;
      box-shadow: none;
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .admin-panel {
      border-width: 2px;
    }

    .status-badge,
    .role-badge {
      font-weight: 900;
    }

    .action-btn,
    .control-btn,
    .nav-btn {
      border-width: 2px;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }

  /* Dark mode enhancements (already built-in, but adding explicit support) */
  @media (prefers-color-scheme: dark) {
    .admin-container {
      color-scheme: dark;
    }
  }

  /* Additional utility classes */
  .text-center {
    text-align: center;
  }

  .mt-1 {
    margin-top: 0.25rem;
  }

  .mt-2 {
    margin-top: 0.5rem;
  }

  .mt-4 {
    margin-top: 1rem;
  }

  .mb-0 {
    margin-bottom: 0;
  }

  /* Error states */
  .error {
    color: #ef4444;
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  /* Success states */
  .success {
    color: #10b981;
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  /* Tooltip styles (for future enhancements) */
  .tooltip {
    position: relative;
  }

  .tooltip::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.5rem 0.75rem;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    font-size: 0.75rem;
    border-radius: 6px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
  }

  .tooltip:hover::after {
    opacity: 1;
  }

  /* Badge variations */
  .badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .badge.small {
    padding: 0.125rem 0.375rem;
    font-size: 0.625rem;
  }

  .badge.large {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
  }

  /* Ensure consistent scrollbar styling */
  .admin-container {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  }

  .admin-container::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .admin-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .admin-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
  }

  .admin-container::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }
</style>