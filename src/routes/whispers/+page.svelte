<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { goto } from '$app/navigation'
  import { supabase } from '$lib/supabase'
  import './game-styles.css'

  interface GamePlayer {
    id: string
    name: string
    affiliation: 'cult' | 'townsfolk' | null
    character: string | null
    joined_at: string
    is_alive: boolean
  }

  let playerName = ''
  let players: GamePlayer[] = []
  let isJoining = false
  let joinMessage = ''
  let gameStarted = false

  // Supabase real-time subscription
  let subscription: any

  async function joinGame() {
    console.log('🎮 Attempting to join game with name:', playerName)
    
    if (!playerName.trim()) {
      joinMessage = 'Please enter your name'
      return
    }

    // Check if name is already taken
    if (players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
      joinMessage = 'This name is already taken'
      return
    }

    isJoining = true
    joinMessage = ''

    try {
      console.log('📡 Inserting player into database...')
      const { data, error } = await supabase
        .from('game_players')
        .insert([{
          name: playerName.trim(),
          affiliation: null, // Will be assigned when game starts
          character: null,
          is_alive: true
        }])
        .select()

      if (error) {
        console.error('❌ Database error:', error)
        throw error
      }

      console.log('✅ Player inserted successfully:', data)
      joinMessage = `${data[0].name} joined the village!`
      playerName = ''
      
      // Manually reload players to ensure we see the change
      await loadPlayers()
      
    } catch (error: any) {
      console.error('💥 Join game error:', error)
      joinMessage = `Error: ${error.message}`
    } finally {
      isJoining = false
    }
  }

  async function loadPlayers() {
    console.log('📊 Loading players from database...')
    try {
      const { data, error } = await supabase
        .from('game_players')
        .select('*')
        .order('joined_at', { ascending: true })

      if (error) {
        console.error('❌ Load players error:', error)
        throw error
      }

      console.log('📋 Players loaded:', data)
      players = data || []
      console.log('🎯 Players array updated, length:', players.length)
    } catch (error) {
      console.error('💥 Error loading players:', error)
    }
  }

  async function clearLobby() {
    try {
      const { error } = await supabase
        .from('game_players')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

      if (error) throw error
      
      players = []
      joinMessage = 'Lobby cleared!'
    } catch (error: any) {
      joinMessage = `Error: ${error.message}`
    }
  }

  async function startGame() {
    if (players.length < 3) {
      joinMessage = 'Need at least 3 players to start'
      return
    }

    // TODO: Assign roles and characters
    gameStarted = true
    joinMessage = 'The darkness descends upon the village...'
  }

  onMount(() => {    
    loadPlayers()

    // Set up real-time subscription
    subscription = supabase
      .channel('game_players')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'game_players' },
        () => {
          loadPlayers()
        }
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
  <title>Village of Shadows - Game Lobby</title>
</svelte:head>

<!-- Blood Particles -->
<div class="blood-particles">
  <div class="blood-drop"></div>
  <div class="blood-drop"></div>
  <div class="blood-drop"></div>
  <div class="blood-drop"></div>
  <div class="blood-drop"></div>
</div>

<main class="container">
  <header>
    <div class="game-logo">
      <h1>VILLAGE OF SHADOWS</h1>
      <div class="game-subtitle">The Cult Awakens</div>
    </div>

    <button class="back-btn" on:click={() => goto('/')}>
      ← Return to Festival
    </button>
  </header>

  <!-- Game Story Introduction -->
  <section class="village-panel">
    <h3>🌙 The Story Begins</h3>
    <div class="story-text">
      <p>
        In a remote village, far from the reach of the outside world, something dark has begun to fester. 
        For months, hushed rumors have spread of a secretive cult growing in numbers—villagers vanishing, 
        only to return changed, eyes hollow and voices no longer their own.
      </p>
      <p>
        At dawn, the villagers discover the lifeless body of their mailman sprawled by the dock—his throat slit, 
        and the words <em>"Feel Her Love"</em> scrawled in blood across the planks.
      </p>
      <p class="cult-message">
        The cult is no longer hiding. They've come to convert—or to kill.
      </p>
    </div>
  </section>

  {#if !gameStarted}
    <!-- Join Game Section -->
    <section class="village-panel">
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
          />
        </div>

        <button type="submit" disabled={isJoining || !playerName.trim()} class="cult-button">
          {isJoining ? 'Entering Village...' : 'Join the Village'}
        </button>

        {#if joinMessage}
          <p class="message" 
             class:death-message={joinMessage.includes('Error') || joinMessage.includes('taken')}
             class:cult-message={joinMessage.includes('Success') || joinMessage.includes('cleared')}>
            {joinMessage}
          </p>
        {/if}
      </form>
    </section>

    <!-- Players in Lobby -->
    <section class="village-panel">
      <div class="lobby-header">
        <h3>👥 Villagers Gathered</h3>
        <div class="player-counter">
          <span class="count">{players.length}</span> souls in the village
        </div>
      </div>

      <!-- Debug info -->
      <div class="debug-info">
        <p><strong>Debug:</strong> Players array length: {players.length}</p>
        <p><strong>Loading state:</strong> {isJoining ? 'Joining...' : 'Ready'}</p>
        <p><strong>Last message:</strong> {joinMessage || 'None'}</p>
      </div>

      {#if players.length === 0}
        <div class="empty-lobby">
          <p>The village lies empty and silent...</p>
          <p class="whisper">Waiting for brave souls to arrive...</p>
        </div>
      {:else}
        <div class="players-grid">
          {#each players as player, i}
            <div class="player-card">
              <div class="player-avatar">
                {player.name.charAt(0).toUpperCase()}
              </div>
              <div class="player-info">
                <h4 class="player-name">{player.name}</h4>
                <p class="join-time">
                  Arrived {new Date(player.joined_at).toLocaleTimeString()}
                </p>
              </div>
              <div class="player-status">
                <span class="status-dot alive"></span>
              </div>
            </div>
          {/each}
        </div>

        <div class="lobby-actions">
          {#if players.length >= 3}
            <button class="cult-button start-btn" on:click={startGame}>
              🌙 Begin the Night ({players.length} players)
            </button>
          {:else}
            <p class="requirement-text">
              Need {3 - players.length} more player{3 - players.length === 1 ? '' : 's'} to start
            </p>
          {/if}
          
          <button class="cult-button clear-btn" on:click={clearLobby}>
            🧹 Clear Lobby
          </button>
        </div>
      {/if}
    </section>
  {:else}
    <!-- Game Started -->
    <section class="village-panel">
      <div class="death-message">
        <h3>The Game Begins...</h3>
        <p>Roles are being assigned. The village holds its breath.</p>
      </div>
    </section>
  {/if}
</main>