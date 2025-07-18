<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { goto } from '$app/navigation'
  import { supabase } from '$lib/supabase'

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
  let subscription: any

  // Game controls
  let selectedPlayers: string[] = []

  async function loadGameData() {
    try {
      // Load players
      const { data: playersData, error: playersError } = await supabase
        .from('game_players')
        .select('*')
        .order('joined_at', { ascending: true })

      if (playersError) throw playersError
      players = playersData || []

      // Load game state
      const { data: stateData, error: stateError } = await supabase
        .from('game_state')
        .select('*')
        .single()

      if (stateError && stateError.code !== 'PGRST116') { // Ignore "no rows" error
        throw stateError
      }
      gameState = stateData

    } catch (error: any) {
      console.error('Error loading game data:', error)
      adminMessage = `Error loading data: ${error.message}`
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
      
    } catch (error: any) {
      console.error('Error starting game:', error)
      adminMessage = `Error starting game: ${error.message}`
    } finally {
      isProcessing = false
    }
  }

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
      
    } catch (error: any) {
      console.error('Error resetting game:', error)
      adminMessage = `Error resetting game: ${error.message}`
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
      
    } catch (error: any) {
      console.error('Error removing player:', error)
      adminMessage = `Error removing player: ${error.message}`
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
      
    } catch (error: any) {
      console.error('Error toggling player life:', error)
      adminMessage = `Error: ${error.message}`
    }
  }

  function getGameStatusColor(status: string) {
    switch (status) {
      case 'lobby': return '#8b8680'
      case 'night': return '#191970'
      case 'day': return '#ffa500'
      case 'voting': return '#8b0000'
      case 'finished': return '#32cd32'
      default: return '#8b8680'
    }
  }

  function getRoleColor(affiliation: string | null) {
    switch (affiliation) {
      case 'cult': return '#8b0000'
      case 'townsfolk': return '#32cd32'
      default: return '#8b8680'
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

<main class="container">
  <header>
    <div class="game-logo">
      <h1>🎭 STORYTELLER CONTROL</h1>
      <div class="game-subtitle">Master of the Village's Fate</div>
    </div>

    <div class="admin-nav">
      <button class="back-btn" on:click={() => goto('/game')}>
        ← View Player Lobby
      </button>
      <button class="back-btn" on:click={() => goto('/')}>
        ← Return to Festival
      </button>
    </div>
  </header>

  <!-- Game Status Overview -->
  <section class="village-panel">
    <h3>🎮 Game Overview</h3>
    
    {#if gameState}
      <div class="status-grid">
        <div class="status-item">
          <span class="status-label">Status:</span>
          <span class="status-value" style="color: {getGameStatusColor(gameState.status)}">
            {gameState.status.toUpperCase()}
          </span>
        </div>
        <div class="status-item">
          <span class="status-label">Phase:</span>
          <span class="status-value">{gameState.current_phase}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Day:</span>
          <span class="status-value">{gameState.day_number}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Players:</span>
          <span class="status-value">{players.length} total, {players.filter(p => p.is_alive).length} alive</span>
        </div>
      </div>
    {:else}
      <p class="cult-message">No game state found. Game may need to be initialized.</p>
    {/if}

    {#if adminMessage}
      <div class="admin-message">
        {adminMessage}
      </div>
    {/if}
  </section>

  <!-- Game Controls -->
  <section class="village-panel">
    <h3>🎛️ Game Controls</h3>
    
    <div class="control-buttons">
      {#if !gameState || gameState.status === 'lobby'}
        <button 
          class="cult-button start-btn" 
          on:click={startGame}
          disabled={isProcessing || players.length < 3}
        >
          {#if isProcessing}
            🌙 Starting Game...
          {:else if players.length < 3}
            🌙 Need {3 - players.length} More Players
          {:else}
            🌙 Start Game & Assign Roles ({players.length} players)
          {/if}
        </button>
      {:else}
        <div class="game-running">
          <p>🎮 Game is currently running in <strong>{gameState.status}</strong> phase</p>
          <!-- TODO: Add phase-specific controls here -->
        </div>
      {/if}

      <button 
        class="cult-button danger-btn" 
        on:click={resetGame}
        disabled={isProcessing}
      >
        🔄 Reset Entire Game
      </button>
    </div>
  </section>

  <!-- Players Management -->
  <section class="village-panel">
    <h3>👥 Players Management</h3>
    
    {#if players.length === 0}
      <div class="empty-lobby">
        <p>No players in the game yet...</p>
        <p class="whisper">Players can join at <a href="/game" target="_blank">/game</a></p>
      </div>
    {:else}
      <div class="admin-players-grid">
        {#each players as player}
          <div class="admin-player-card" class:dead={!player.is_alive}>
            <div class="player-header">
              <div class="player-avatar">
                {player.name.charAt(0).toUpperCase()}
              </div>
              <div class="player-basic-info">
                <h4 class="player-name">{player.name}</h4>
                <p class="join-time">
                  Joined {new Date(player.joined_at).toLocaleTimeString()}
                </p>
              </div>
              <div class="player-status">
                <span class="status-dot" class:alive={player.is_alive} class:dead={!player.is_alive}></span>
              </div>
            </div>

            {#if player.affiliation || player.character}
              <div class="player-role-info">
                {#if player.affiliation}
                  <span class="affiliation" style="color: {getRoleColor(player.affiliation)}">
                    {player.affiliation.toUpperCase()}
                  </span>
                {/if}
                {#if player.character}
                  <span class="character">{player.character}</span>
                {/if}
              </div>
            {:else}
              <div class="player-role-info">
                <span class="no-role">Role not assigned</span>
              </div>
            {/if}

            <div class="admin-controls">
              <button 
                class="mini-btn life-btn"
                class:resurrect={!player.is_alive}
                class:kill={player.is_alive}
                on:click={() => togglePlayerLife(player.id, player.name, player.is_alive)}
              >
                {player.is_alive ? '💀 Kill' : '✨ Revive'}
              </button>
              <button 
                class="mini-btn danger-btn"
                on:click={() => removePlayer(player.id, player.name)}
              >
                🗑️ Remove
              </button>
            </div>
          </div>
        {/each}
      </div>

      <!-- Quick Stats -->
      <div class="quick-stats">
        <div class="stat-item">
          <span class="stat-label">Cult Members:</span>
          <span class="stat-value" style="color: #8b0000">
            {players.filter(p => p.affiliation === 'cult').length}
          </span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Townsfolk:</span>
          <span class="stat-value" style="color: #32cd32">
            {players.filter(p => p.affiliation === 'townsfolk').length}
          </span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Alive:</span>
          <span class="stat-value">
            {players.filter(p => p.is_alive).length} / {players.length}
          </span>
        </div>
      </div>
    {/if}
  </section>
</main>

<style>
/* Admin-specific styling */
.admin-nav {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: rgba(139, 0, 0, 0.1);
  border-radius: 10px;
  border: 1px solid rgba(139, 0, 0, 0.2);
}

.status-label {
  font-weight: 600;
  color: #8b8680;
}

.status-value {
  font-weight: 700;
  color: #d4d4d8;
}

.admin-message {
  background: linear-gradient(135deg, rgba(25, 25, 112, 0.2), rgba(139, 0, 0, 0.1));
  border: 1px solid rgba(139, 0, 0, 0.3);
  padding: 1rem;
  border-radius: 10px;
  margin-top: 1rem;
  font-weight: 600;
  color: #d4d4d8;
}

.control-buttons {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.start-btn {
  background: linear-gradient(135deg, #32cd32, #228b22);
  color: #000000;
  font-weight: 800;
}

.danger-btn {
  background: linear-gradient(135deg, #8b0000, #ff4500);
  color: #ffffff;
}

.game-running {
  text-align: center;
  padding: 2rem;
  background: rgba(50, 205, 50, 0.1);
  border-radius: 15px;
  border: 2px solid rgba(50, 205, 50, 0.3);
}

.admin-players-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.admin-player-card {
  background: 
    linear-gradient(135deg, rgba(0, 0, 0, 0.7), rgba(20, 20, 40, 0.9)),
    linear-gradient(45deg, rgba(139, 0, 0, 0.05), rgba(25, 25, 112, 0.03));
  border: 1px solid rgba(139, 0, 0, 0.3);
  border-radius: 15px;
  padding: 1.5rem;
  transition: all 0.3s ease;
}

.admin-player-card.dead {
  opacity: 0.6;
  border-color: #8b0000;
  background: 
    linear-gradient(135deg, rgba(139, 0, 0, 0.2), rgba(0, 0, 0, 0.9));
}

.player-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.player-basic-info {
  flex: 1;
}

.player-role-info {
  margin-bottom: 1rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  text-align: center;
}

.affiliation {
  font-weight: 800;
  font-size: 0.9rem;
  margin-right: 0.5rem;
}

.character {
  font-style: italic;
  color: #d4d4d8;
}

.no-role {
  color: #8b8680;
  font-style: italic;
}

.admin-controls {
  display: flex;
  gap: 0.5rem;
}

.mini-btn {
  flex: 1;
  padding: 0.5rem 1rem;
  border: 1px solid rgba(139, 0, 0, 0.3);
  border-radius: 8px;
  background: rgba(139, 0, 0, 0.1);
  color: #d4d4d8;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.8rem;
  font-weight: 600;
}

.mini-btn:hover {
  background: rgba(139, 0, 0, 0.2);
  transform: translateY(-1px);
}

.mini-btn.kill {
  border-color: #8b0000;
  color: #ff6b6b;
}

.mini-btn.resurrect {
  border-color: #32cd32;
  color: #90ee90;
}

.status-dot.alive {
  background: #32cd32;
  box-shadow: 0 0 10px rgba(50, 205, 50, 0.6);
}

.status-dot.dead {
  background: #8b0000;
  box-shadow: 0 0 10px rgba(139, 0, 0, 0.6);
}

.quick-stats {
  display: flex;
  justify-content: space-around;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 15px;
  border: 1px solid rgba(139, 0, 0, 0.2);
}

.stat-item {
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 0.9rem;
  color: #8b8680;
  margin-bottom: 0.3rem;
}

.stat-value {
  display: block;
  font-size: 1.2rem;
  font-weight: 800;
}

.empty-lobby a {
  color: #ff6bb3;
  text-decoration: none;
}

.empty-lobby a:hover {
  text-decoration: underline;
}

/* Responsive */
@media (max-width: 768px) {
  .admin-nav {
    flex-direction: column;
  }
  
  .status-grid {
    grid-template-columns: 1fr;
  }
  
  .admin-players-grid {
    grid-template-columns: 1fr;
  }
  
  .quick-stats {
    flex-direction: column;
    gap: 1rem;
  }
}
</style>