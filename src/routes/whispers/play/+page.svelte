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

  let currentPlayer: GamePlayer | null = null
  let allPlayers: GamePlayer[] = []
  let gameState: GameState | null = null
  let playerName = ''
  let isFlipped = false
  let pinCode = ''
  let gameMessage = ''
  let subscription: any

  // Role descriptions and abilities
  const roleInfo: Record<string, { description: string; ability: string; tip: string }> = {
    'Cult Leader': {
      description: 'The mastermind behind the cult\'s dark agenda',
      ability: 'Can recruit one villager per night (limited uses)',
      tip: 'Stay hidden and coordinate with your cult members'
    },
    'Cult Member': {
      description: 'A devoted follower of the cult',
      ability: 'Knows other cult members',
      tip: 'Blend in during the day, strike at night'
    },
    'Private Investigator': {
      description: 'A keen observer seeking the truth',
      ability: 'Can investigate one player each night',
      tip: 'Use your findings wisely - trust no one'
    },
    'Body Guard': {
      description: 'A protector of the innocent',
      ability: 'Can protect one player from elimination each night',
      tip: 'Choose your protections carefully'
    },
    'Villager': {
      description: 'An ordinary citizen caught in extraordinary circumstances',
      ability: 'Vote during the day to eliminate suspects',
      tip: 'Pay attention to behavior and voting patterns'
    }
  }

  // Check if player is already in the game
  async function checkPlayerStatus() {
    const savedName = sessionStorage.getItem('playerName')
    if (!savedName) {
      goto('/join') // Redirect to join page if not joined
      return
    }

    playerName = savedName

    try {
      const { data, error } = await supabase
        .from('game_players')
        .select('*')
        .eq('name', playerName)
        .single()

      if (error || !data) {
        console.error('Player not found:', error)
        goto('/join')
        return
      }

      currentPlayer = data
    } catch (error) {
      console.error('Error checking player status:', error)
      goto('/join')
    }
  }

  async function loadGameData() {
    try {
      // Load game state
      const { data: stateData, error: stateError } = await supabase
        .from('game_state')
        .select('*')
        .single()

      if (stateError) throw stateError
      gameState = stateData

      // Load all players
      const { data: playersData, error: playersError } = await supabase
        .from('game_players')
        .select('*')
        .order('joined_at', { ascending: true })

      if (playersError) throw playersError
      allPlayers = playersData || []

      // Update current player data
      if (currentPlayer) {
        const updated = allPlayers.find(p => p.id === currentPlayer!.id)
        if (updated) currentPlayer = updated
      }

    } catch (error: any) {
      console.error('Error loading game data:', error)
      gameMessage = 'Error loading game data'
    }
  }

  function flipCard() {
    isFlipped = !isFlipped
  }

  async function submitPinCode() {
    if (!pinCode.trim()) return

    // TODO: Implement pin code submission logic
    console.log('Submitting pin code:', pinCode)
    gameMessage = 'Pin code submitted'
    pinCode = ''
  }

  function getCharacterArt(character: string | null): string {
    // Return emoji art for now - replace with actual images later
    const art: Record<string, string> = {
      'Cult Leader': '🕯️',
      'Cult Member': '🌙',
      'Private Investigator': '🔍',
      'Body Guard': '🛡️',
      'Villager': '🏘️'
    }
    return art[character || ''] || '❓'
  }

  function getPhaseDisplay(): string {
    if (!gameState) return 'Waiting...'
    
    switch (gameState.status) {
      case 'lobby': return 'Waiting in Lobby'
      case 'night': return `Night ${gameState.day_number}`
      case 'day': return `Day ${gameState.day_number}`
      case 'voting': return `Voting - Day ${gameState.day_number}`
      case 'finished': return 'Game Over'
      default: return gameState.current_phase
    }
  }

  onMount(() => {
    checkPlayerStatus()
    loadGameData()

    // Set up real-time subscription
    subscription = supabase
      .channel('game_channel')
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
  <title>Village of Shadows - Game</title>
</svelte:head>

<div class="game-container">
  <header class="game-header">
    <button class="leave-btn" on:click={() => goto('/')}>
      ← Leave Game
    </button>
    <h1 class="game-title">Village of Shadows</h1>
    <div class="phase-indicator">
      {getPhaseDisplay()}
    </div>
  </header>

  <main class="game-main">
    {#if currentPlayer && gameState}
      <div class="card-container">
        <div class="flip-card" class:flipped={isFlipped}>
          <!-- Front: Private Player Card -->
          <div class="flip-card-front">
            <div class="player-card-content">
              <div class="card-header">
                <h2 class="player-name">{currentPlayer.name}</h2>
                <span class="status-indicator" class:alive={currentPlayer.is_alive} class:dead={!currentPlayer.is_alive}>
                  {currentPlayer.is_alive ? '❤️ Alive' : '💀 Dead'}
                </span>
              </div>

              <div class="character-display">
                <div class="character-art">
                  {getCharacterArt(currentPlayer.character)}
                </div>
                <h3 class="character-name">{currentPlayer.character || 'Unknown Role'}</h3>
              </div>

              <div class="affiliation-badge" class:cult={currentPlayer.affiliation === 'cult'} class:townsfolk={currentPlayer.affiliation === 'townsfolk'}>
                {currentPlayer.affiliation ? currentPlayer.affiliation.toUpperCase() : 'UNASSIGNED'}
              </div>

              {#if currentPlayer.character && roleInfo[currentPlayer.character]}
                <div class="role-details">
                  <div class="role-section">
                    <h4>Description</h4>
                    <p>{roleInfo[currentPlayer.character].description}</p>
                  </div>
                  
                  <div class="role-section">
                    <h4>Ability</h4>
                    <p class="ability-text">{roleInfo[currentPlayer.character].ability}</p>
                  </div>
                  
                  <div class="role-section">
                    <h4>Strategy Tip</h4>
                    <p class="tip-text">{roleInfo[currentPlayer.character].tip}</p>
                  </div>
                </div>
              {/if}

              <button class="flip-button" on:click={flipCard}>
                <span class="flip-icon">🔄</span>
                Flip to Game View
              </button>

              <div class="card-warning">
                ⚠️ Keep this side private - do not show other players!
              </div>
            </div>
          </div>

          <!-- Back: Public Game Side -->
          <div class="flip-card-back">
            <div class="game-side-content">
              <div class="game-header">
                <h2>{currentPlayer.name}</h2>
                <span class="public-status" class:alive={currentPlayer.is_alive}>
                  {currentPlayer.is_alive ? 'Active' : 'Eliminated'}
                </span>
              </div>

              <div class="game-stats">
                <div class="stat-card">
                  <span class="stat-label">Players Alive</span>
                  <span class="stat-value">{allPlayers.filter(p => p.is_alive).length}/{allPlayers.length}</span>
                </div>
                <div class="stat-card">
                  <span class="stat-label">Phase</span>
                  <span class="stat-value">{gameState.status}</span>
                </div>
                <div class="stat-card">
                  <span class="stat-label">Day</span>
                  <span class="stat-value">{gameState.day_number}</span>
                </div>
              </div>

              <div class="players-list">
                <h3>Village Status</h3>
                <div class="player-grid">
                  {#each allPlayers as player}
                    <div class="player-tile" class:dead={!player.is_alive} class:current={player.id === currentPlayer.id}>
                      <span class="player-avatar">{player.name.charAt(0).toUpperCase()}</span>
                      <span class="player-tile-name">{player.name}</span>
                      {#if !player.is_alive}
                        <span class="death-marker">☠️</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>

              {#if currentPlayer.is_alive}
                <div class="action-area">
                  <h3>Actions</h3>
                  <form on:submit|preventDefault={submitPinCode} class="pin-form">
                    <input
                      type="text"
                      bind:value={pinCode}
                      placeholder="Enter PIN code..."
                      class="pin-input"
                      maxlength="6"
                    />
                    <button type="submit" class="submit-btn">
                      Submit
                    </button>
                  </form>
                </div>
              {/if}

              {#if gameMessage}
                <div class="game-message">
                  {gameMessage}
                </div>
              {/if}

              <button class="flip-button" on:click={flipCard}>
                <span class="flip-icon">🔄</span>
                Flip to Player Card
              </button>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading game data...</p>
      </div>
    {/if}
  </main>
</div>

<style>
  .game-container {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
    min-height: 100vh;
    color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .game-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .leave-btn {
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #f8fafc;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .leave-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .game-title {
    font-size: 1.5rem;
    margin: 0;
    background: linear-gradient(135deg, #60a5fa, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .phase-indicator {
    padding: 0.5rem 1rem;
    background: rgba(59, 130, 246, 0.2);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 20px;
    font-weight: 600;
  }

  .game-main {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: calc(100vh - 80px);
    padding: 2rem;
  }

  /* Flip Card Styles */
  .card-container {
    perspective: 1000px;
    width: 100%;
    max-width: 500px;
  }

  .flip-card {
    position: relative;
    width: 100%;
    height: 700px;
    transition: transform 0.6s;
    transform-style: preserve-3d;
  }

  .flip-card.flipped {
    transform: rotateY(180deg);
  }

  .flip-card-front,
  .flip-card-back {
    position: absolute;
    width: 100%;
    height: 100%;
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .flip-card-front {
    background: linear-gradient(135deg, rgba(139, 0, 0, 0.1), rgba(25, 25, 112, 0.1)),
                linear-gradient(135deg, #1e293b, #0f172a);
    border: 2px solid rgba(139, 0, 0, 0.3);
  }

  .flip-card-back {
    background: linear-gradient(135deg, #1e293b, #334155);
    border: 2px solid rgba(255, 255, 255, 0.1);
    transform: rotateY(180deg);
  }

  /* Player Card Content */
  .player-card-content {
    padding: 2rem;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .player-name {
    font-size: 1.5rem;
    margin: 0;
    color: #f8fafc;
  }

  .status-indicator {
    padding: 0.375rem 0.75rem;
    border-radius: 20px;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .status-indicator.alive {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .status-indicator.dead {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .character-display {
    text-align: center;
    margin-bottom: 2rem;
  }

  .character-art {
    font-size: 6rem;
    margin-bottom: 1rem;
    filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.1));
  }

  .character-name {
    font-size: 1.5rem;
    margin: 0;
    color: #e2e8f0;
  }

  .affiliation-badge {
    text-align: center;
    padding: 0.75rem;
    border-radius: 10px;
    font-weight: 700;
    font-size: 1.125rem;
    letter-spacing: 0.1em;
    margin-bottom: 2rem;
  }

  .affiliation-badge.cult {
    background: linear-gradient(135deg, rgba(220, 38, 38, 0.3), rgba(139, 0, 0, 0.2));
    color: #ef4444;
    border: 2px solid rgba(220, 38, 38, 0.5);
  }

  .affiliation-badge.townsfolk {
    background: linear-gradient(135deg, rgba(5, 150, 105, 0.3), rgba(16, 185, 129, 0.2));
    color: #10b981;
    border: 2px solid rgba(5, 150, 105, 0.5);
  }

  .role-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .role-section {
    background: rgba(255, 255, 255, 0.05);
    padding: 1rem;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .role-section h4 {
    margin: 0 0 0.5rem 0;
    color: #60a5fa;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .role-section p {
    margin: 0;
    color: #e2e8f0;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .ability-text {
    color: #fbbf24 !important;
  }

  .tip-text {
    font-style: italic;
    color: #94a3b8 !important;
  }

  .flip-button {
    width: 100%;
    padding: 1rem;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2));
    border: 2px solid rgba(59, 130, 246, 0.3);
    color: #f8fafc;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .flip-button:hover {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(139, 92, 246, 0.3));
    transform: translateY(-2px);
    box-shadow: 0 5px 20px rgba(59, 130, 246, 0.3);
  }

  .flip-icon {
    font-size: 1.25rem;
  }

  .card-warning {
    text-align: center;
    padding: 0.75rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 10px;
    color: #fca5a5;
    font-size: 0.875rem;
    margin-top: auto;
  }

  /* Game Side Content */
  .game-side-content {
    padding: 2rem;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .game-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .game-header h2 {
    margin: 0;
    font-size: 1.5rem;
  }

  .public-status {
    padding: 0.375rem 0.75rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 20px;
    font-size: 0.875rem;
  }

  .public-status.alive {
    background: rgba(16, 185, 129, 0.1);
    border-color: rgba(16, 185, 129, 0.3);
    color: #10b981;
  }

  .game-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.05);
    padding: 1rem;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    text-align: center;
  }

  .stat-label {
    display: block;
    font-size: 0.75rem;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.25rem;
  }

  .stat-value {
    display: block;
    font-size: 1.25rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .players-list {
    flex: 1;
    margin-bottom: 2rem;
  }

  .players-list h3 {
    margin: 0 0 1rem 0;
    color: #e2e8f0;
  }

  .player-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 0.75rem;
  }

  .player-tile {
    position: relative;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 0.75rem;
    text-align: center;
    transition: all 0.2s;
  }

  .player-tile.current {
    border-color: #60a5fa;
    background: rgba(59, 130, 246, 0.1);
  }

  .player-tile.dead {
    opacity: 0.5;
    background: rgba(239, 68, 68, 0.05);
  }

  .player-avatar {
    display: block;
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #60a5fa, #a78bfa);
    border-radius: 50%;
    margin: 0 auto 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: white;
  }

  .player-tile-name {
    display: block;
    font-size: 0.75rem;
    color: #e2e8f0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .death-marker {
    position: absolute;
    top: -5px;
    right: -5px;
    font-size: 1.25rem;
  }

  .action-area {
    margin-bottom: 2rem;
  }

  .action-area h3 {
    margin: 0 0 1rem 0;
    color: #e2e8f0;
  }

  .pin-form {
    display: flex;
    gap: 0.75rem;
  }

  .pin-input {
    flex: 1;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: #f8fafc;
    font-size: 1rem;
    text-align: center;
    letter-spacing: 0.2em;
  }

  .pin-input:focus {
    outline: none;
    border-color: #60a5fa;
    background: rgba(255, 255, 255, 0.1);
  }

  .submit-btn {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #059669, #10b981);
    border: none;
    border-radius: 8px;
    color: white;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .submit-btn:hover {
    background: linear-gradient(135deg, #047857, #059669);
    transform: translateY(-1px);
  }

  .game-message {
    padding: 1rem;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 10px;
    text-align: center;
    margin-bottom: 1rem;
    color: #60a5fa;
  }

  /* Loading State */
  .loading-state {
    text-align: center;
    color: #94a3b8;
  }

  .loading-spinner {
    width: 50px;
    height: 50px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top: 3px solid #60a5fa;
    border-radius: 50%;
    margin: 0 auto 1rem;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .game-header {
      padding: 1rem;
    }

    .game-title {
      font-size: 1.25rem;
    }

    .flip-card {
      height: 600px;
    }

    .player-card-content,
    .game-side-content {
      padding: 1.5rem;
    }

    .character-art {
      font-size: 4rem;
    }

    .game-stats {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .player-grid {
      grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
    }

    .player-avatar {
      width: 35px;
      height: 35px;
      font-size: 0.875rem;
    }
  }

  @media (max-width: 480px) {
    .game-main {
      padding: 1rem;
    }

    .flip-card {
      height: 500px;
    }

    .character-art {
      font-size: 3rem;
    }

    .role-section {
      padding: 0.75rem;
    }

    .pin-form {
      flex-direction: column;
    }

    .submit-btn {
      width: 100%;
    }
  }
</style>