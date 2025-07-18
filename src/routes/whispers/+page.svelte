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

<!-- Game Container with Isolated Styles -->
<div class="game-container">
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
</div>

<style>
  /* ==========================================================================
     CULT VILLAGE HORROR GAME - COMPONENT SCOPED STYLES
     ========================================================================== */

  /* Game Container - Isolates all game styles */
  .game-container {
    /* Reset any inherited floral styles */
    all: initial;
    display: block;
    
    /* Dark Village Atmosphere */
    background: 
      radial-gradient(ellipse at top, #1a1a2e 0%, #16213e 30%, #0f0f23 60%, #000000 100%),
      linear-gradient(180deg, #0a0a0f 0%, #1a1320 40%, #2d1b2e 70%, #000000 100%);
    min-height: 100vh;
    position: relative;
    overflow-x: hidden;
    font-family: 'Georgia', 'Times New Roman', serif;
    color: #d4d4d8;
    box-sizing: border-box;
  }

  /* Ensure all child elements use border-box */
  .game-container *,
  .game-container *::before,
  .game-container *::after {
    box-sizing: border-box;
  }

  /* Creeping Fog Effect */
  .game-container::before {
    content: '';
    position: fixed;
    bottom: -50px;
    left: -50%;
    width: 200%;
    height: 300px;
    background: 
      radial-gradient(ellipse at center, rgba(139, 137, 137, 0.1) 0%, transparent 70%),
      radial-gradient(ellipse at 20% 50%, rgba(169, 169, 169, 0.05) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 30%, rgba(105, 105, 105, 0.08) 0%, transparent 50%);
    animation: creepingFog 25s ease-in-out infinite, fogDrift 40s linear infinite;
    pointer-events: none;
    z-index: -1;
  }

  /* Ominous Shadows */
  .game-container::after {
    content: '';
    position: fixed;
    top: -20%;
    right: -30%;
    width: 80%;
    height: 120%;
    background: 
      radial-gradient(ellipse at center, transparent 30%, rgba(139, 0, 0, 0.03) 50%, transparent 80%),
      conic-gradient(from 0deg, transparent, rgba(64, 0, 0, 0.05), transparent, rgba(25, 25, 112, 0.03), transparent);
    animation: ominousShadows 60s ease-in-out infinite;
    pointer-events: none;
    z-index: -1;
  }

  /* Floating Blood Droplets */
  .blood-particles {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: -1;
  }

  .blood-drop {
    position: absolute;
    width: 3px;
    height: 8px;
    background: radial-gradient(ellipse, rgba(139, 0, 0, 0.6), rgba(75, 0, 0, 0.3));
    border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
    animation: bloodFall 15s infinite linear;
  }

  .blood-drop:nth-child(1) { left: 15%; animation-delay: 0s; }
  .blood-drop:nth-child(2) { left: 35%; animation-delay: -3s; }
  .blood-drop:nth-child(3) { left: 55%; animation-delay: -6s; }
  .blood-drop:nth-child(4) { left: 75%; animation-delay: -9s; }
  .blood-drop:nth-child(5) { left: 85%; animation-delay: -12s; }

  /* Dark Container */
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    color: #d4d4d8;
    position: relative;
    z-index: 1;
  }

  /* Sinister Game Header */
  .game-logo {
    text-align: center;
    margin-bottom: 3rem;
    position: relative;
  }

  /* Occult Symbol Behind Logo */
  .game-logo::before {
    content: '';
    position: absolute;
    top: -80px;
    left: 50%;
    transform: translateX(-50%);
    width: 300px;
    height: 300px;
    background: 
      conic-gradient(from 0deg, 
        transparent 0deg, rgba(139, 0, 0, 0.08) 45deg, 
        transparent 90deg, rgba(25, 25, 112, 0.06) 135deg,
        transparent 180deg, rgba(139, 0, 0, 0.08) 225deg,
        transparent 270deg, rgba(64, 0, 0, 0.05) 315deg, transparent 360deg
      );
    border-radius: 50%;
    animation: occultSpin 80s linear infinite;
    z-index: -1;
  }

  .game-logo h1 {
    font-size: 3.5rem;
    margin: 0;
    background: linear-gradient(45deg, #8b0000, #191970, #2f1b14, #8b0000);
    background-size: 300% 300%;
    animation: bloodFlow 8s ease-in-out infinite;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: 0.15em;
    font-weight: 900;
    font-family: 'Georgia', serif;
    text-shadow: 0 0 30px rgba(139, 0, 0, 0.5);
    position: relative;
  }

  /* Dark Decorative Elements */
  .game-logo h1::before {
    content: '🗡️';
    position: absolute;
    left: -60px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 2.5rem;
    animation: weaponGlint 12s ease-in-out infinite;
    filter: drop-shadow(0 0 15px rgba(139, 0, 0, 0.7));
  }

  .game-logo h1::after {
    content: '☠️';
    position: absolute;
    right: -60px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 2.5rem;
    animation: skullFloat 10s ease-in-out infinite;
    filter: drop-shadow(0 0 15px rgba(75, 0, 0, 0.8));
  }

  .game-subtitle {
    font-size: 1.2rem;
    color: #8b8680;
    margin-top: 1rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    font-weight: 600;
    animation: subtleGlow 6s ease-in-out infinite;
  }

  /* Back Button */
  .back-btn {
    background: linear-gradient(135deg, rgba(139, 0, 0, 0.2), rgba(25, 25, 112, 0.15));
    border: 2px solid rgba(139, 0, 0, 0.4);
    color: #d4d4d8;
    padding: 0.8rem 1.5rem;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.3s ease;
    font-family: 'Georgia', serif;
    text-decoration: none;
    display: inline-block;
    margin-bottom: 1rem;
  }

  .back-btn:hover {
    background: linear-gradient(135deg, rgba(139, 0, 0, 0.4), rgba(25, 25, 112, 0.3));
    border-color: #8b0000;
    color: #ffffff;
    transform: translateY(-2px);
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

  .story-text p {
    color: #d4d4d8;
    line-height: 1.6;
    margin-bottom: 1rem;
    font-family: 'Georgia', serif;
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
    background: 
      linear-gradient(135deg, rgba(0, 0, 0, 0.6), rgba(20, 20, 40, 0.8));
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

  .debug-info {
    background: rgba(0, 0, 0, 0.3);
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
    color: #8b8680;
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

  .lobby-actions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .requirement-text {
    color: #8b8680;
    font-style: italic;
    margin: 0;
  }

  /* Game Status Messages */
  .message {
    margin-top: 1rem;
    padding: 1rem;
    border-radius: 10px;
    text-align: center;
    font-weight: 600;
  }

  .death-message {
    background: linear-gradient(135deg, rgba(139, 0, 0, 0.3), rgba(0, 0, 0, 0.8));
    border: 2px solid #8b0000;
    color: #ffffff;
    padding: 1.5rem;
    border-radius: 15px;
    text-align: center;
    font-weight: 600;
    font-family: 'Georgia', serif;
    box-shadow: 0 0 25px rgba(139, 0, 0, 0.5);
    animation: deathPulse 3s ease-in-out infinite;
  }

  .cult-message {
    background: linear-gradient(135deg, rgba(25, 25, 112, 0.3), rgba(0, 0, 0, 0.8));
    border: 2px solid #191970;
    color: #d4d4d8;
    padding: 1.5rem;
    border-radius: 15px;
    text-align: center;
    font-style: italic;
    font-family: 'Georgia', serif;
  }

  /* Horror Animations */
  @keyframes bloodFlow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  @keyframes weaponGlint {
    0%, 100% { 
      transform: translateY(-50%) rotate(-15deg) scale(1);
      filter: drop-shadow(0 0 15px rgba(139, 0, 0, 0.7));
    }
    50% { 
      transform: translateY(-50%) rotate(15deg) scale(1.1);
      filter: drop-shadow(0 0 25px rgba(139, 0, 0, 1)) hue-rotate(30deg);
    }
  }

  @keyframes skullFloat {
    0%, 100% { 
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
    0% { transform: translateX(-50%) rotate(0deg); }
    100% { transform: translateX(-50%) rotate(360deg); }
  }

  @keyframes creepingFog {
    0%, 100% { opacity: 0.3; transform: scaleX(1); }
    50% { opacity: 0.6; transform: scaleX(1.2); }
  }

  @keyframes fogDrift {
    0% { transform: translateX(-20%); }
    100% { transform: translateX(20%); }
  }

  @keyframes ominousShadows {
    0%, 100% { 
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
    10% { opacity: 0.8; }
    90% { opacity: 0.6; }
    100% { 
      transform: translateY(100vh) rotate(360deg);
      opacity: 0;
    }
  }

  @keyframes subtleGlow {
    0%, 100% { 
      opacity: 0.7; 
      text-shadow: 0 0 10px rgba(139, 0, 0, 0.3);
    }
    50% { 
      opacity: 1; 
      text-shadow: 0 0 20px rgba(139, 0, 0, 0.6);
    }
  }

  @keyframes deathPulse {
    0%, 100% { 
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
    .container {
      padding: 1rem;
    }
    
    .game-logo h1 {
      font-size: 2.5rem;
    }
    
    .game-logo h1::before,
    .game-logo h1::after {
      display: none;
    }
    
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

    .lobby-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .player-card {
      padding: 1rem;
    }

    .player-avatar {
      width: 40px;
      height: 40px;
      font-size: 1rem;
    }

    .debug-info {
      font-size: 0.8rem;
      padding: 0.8rem;
    }
  }

  /* Touch-friendly improvements for mobile */
  @media (max-width: 480px) {
    .game-logo h1 {
      font-size: 2rem;
    }
    
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
  }</style>