<script lang="ts">
  import { onMount } from 'svelte'
  import { supabase, type RSVP } from '$lib/supabase'
  import './styles.css'

  let formData: Omit<RSVP, 'id' | 'created_at'> = {
    name: '',
    attending: true,
    message: ''
  }

  let isSubmitting = false
  let submitMessage = ''
  let rsvps: RSVP[] = []
  let totalAttending = 0
  let carousel: HTMLElement
  let currentSlide = 0

  async function submitRSVP() {
    if (!formData.name) {
      submitMessage = 'Please enter your name'
      return
    }

    isSubmitting = true
    submitMessage = ''

    try {
      const { error } = await supabase
        .from('rsvps')
        .insert([formData])

      if (error) throw error

      submitMessage = 'RSVP submitted successfully!'
      
      // Reset form
      formData = {
        name: '',
        attending: true,
        message: ''
      }

      // Refresh the list
      await loadRSVPs()
    } catch (error: any) {
      submitMessage = `Error: ${error.message}`
    } finally {
      isSubmitting = false
    }
  }

  async function loadRSVPs() {
    try {
      const { data, error } = await supabase
        .from('rsvps')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      rsvps = data || []
      totalAttending = rsvps.filter(rsvp => rsvp.attending).length
    } catch (error) {
      console.error('Error loading RSVPs:', error)
    }
  }

  function scrollCarousel(direction: number) {
    return () => {
      const attendees = rsvps.filter(r => r.attending)
      const maxSlide = Math.max(0, attendees.length - 3)
      currentSlide = Math.max(0, Math.min(maxSlide, currentSlide + direction))
      
      if (carousel) {
        carousel.style.transform = `translateX(-${currentSlide * 320}px)`
      }
    }
  }

  onMount(() => {
    loadRSVPs()
  })
</script>

<svelte:head>
  <title>Bryggesjau</title>
</svelte:head>

<!-- Cosmic Particle System -->
<div class="cosmic-particles">
  <div class="particle"></div>
  <div class="particle"></div>
  <div class="particle"></div>
  <div class="particle"></div>
  <div class="particle"></div>
  <div class="particle"></div>
</div>

<main class="container">
  <header>
    <div class="festival-logo">
      <h1>BRYGGESJAU25</h1>
      <div class="subtitle">For 10yrs+</div>
    </div>
    
    <div class="party-details">
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-icon">📅</div>
          <div class="detail-content">
            <h3>When</h3>
            <p>Saturday, <b style="color: black">August 9th</b>, 2025</p>
            <p class="time">18:00 - Late</p>
          </div>
        </div>
        
        <div class="detail-item">
          <div class="detail-icon">📍</div>
          <div class="detail-content">
            <h3>Where</h3>
            <p>Tysvær</p>
            <p class="location">Førlandsvegen 479</p>
          </div>
        </div>
        
        <div class="detail-item">
          <div class="detail-icon">🌿</div>
          <div class="detail-content">
            <h3>Vibes</h3>
            <p>Music</p>
            <p class="genre">Mysterious, difficult game</p>
            <p class="genre">Stamp</p>
            <p class="genre">BBQ</p>
          </div>
        </div>
        
        <div class="detail-item">
          <div class="detail-icon">🍻</div>
          <div class="detail-content">
            <h3>Bring</h3>
            <p>Drinks</p>
            <p>Swimming attire</p>
            <p>Energy for dancing</p>
          </div>
        </div>
      </div>
      
      <div class="festival-info">
        <p class="description">
            Once again I have the privilege to invite you to the annual summer party. Most of you know the drill by now: Bring what you want to eat/drink, let me know if you're crashing, and don't hesitate to invite people. 
          
        </p>
        <div class="dress-code">
              <p><b>New of the year</b></p>
          <strong>Dress Code:</strong> Festival flora fashion, comfortable dancing feet, and an open heart 🌺🍃
        </div>
      </div>
    </div>
  </header>

  <section class="rsvp-form">
    <h3>Join the Experience</h3>
    <p class="form-description">Ready to lose yourself in the rhythm? Let us know you're coming!</p>
    <form on:submit|preventDefault={submitRSVP}>
      <div class="form-group">
        <label for="name">Your Name *</label>
        <input
          id="name"
          type="text"
          bind:value={formData.name}
          required
          placeholder="Enter your name"
        />
      </div>

      <div class="form-group">
        <label>Are you ready to dance?</label>
        <div class="radio-group">
          <label class="radio-option attending">
            <input
              type="radio"
              bind:group={formData.attending}
              value={true}
            />
            <span class="radio-custom"></span>
            Yes, I'm ready! 🚀
          </label>
          <label class="radio-option not-attending">
            <input
              type="radio"
              bind:group={formData.attending}
              value={false}
            />
            <span class="radio-custom"></span>
            Sorry, can't make it this time 😢
          </label>
        </div>
      </div>

      <div class="form-group">
        <label for="message">Message (optional)</label>
        <textarea
          id="message"
          bind:value={formData.message}
          placeholder="Your message goes here!"
          rows="3"
        ></textarea>
      </div>

      <button type="submit" disabled={isSubmitting} class="submit-btn">
        {isSubmitting ? 'Connecting...' : 'Join!!'}
      </button>

      {#if submitMessage}
        <p class="message" class:success={submitMessage.includes('success')} class:error={submitMessage.includes('Error')}>
          {submitMessage}
        </p>
      {/if}
    </form>
  </section>

  <section class="attendee-carousel">
    <h3>The plot thickens</h3>
    <div class="carousel-container">
      <div class="carousel" bind:this={carousel}>
        {#each rsvps.filter(r => r.attending) as rsvp, i}
          <div class="attendee-card" style="--index: {i}">
            <div class="card-inner">
              <div class="avatar">
                <div class="avatar-text">{rsvp.name}</div>
              </div>
              <div class="attendee-name">{rsvp.name}</div>
              {#if rsvp.message}
                <div class="attendee-message">"{rsvp.message}"</div>
              {/if}
              <div class="join-time">
                Joined {rsvp.created_at ? new Date(rsvp.created_at).toLocaleDateString() : 'Recently'}
              </div>
            </div>
          </div>
        {/each}
      </div>
      
      {#if rsvps.filter(r => r.attending).length > 3}
        <button class="carousel-btn prev" on:click={scrollCarousel(-1)}>‹</button>
        <button class="carousel-btn next" on:click={scrollCarousel(1)}>›</button>
      {/if}
    </div>
    
    <div class="energy-meter">
      <div class="meter-label">Hype meter</div>
      <div class="meter-bar">
        <div class="meter-fill" style="width: {Math.min(totalAttending * 5, 100)}%"></div>
      </div>
      <div class="meter-text">{totalAttending} people ready to rip</div>
    </div>
  </section>
</main>