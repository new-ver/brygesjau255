import { writable, derived, get } from 'svelte/store';
import { supabase } from '$lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Types
export interface GamePlayer {
	id: string;
	name: string;
	affiliation: 'cult' | 'townsfolk' | null;
	character: string | null;
	joined_at: string;
	is_alive: boolean;
}

export interface GameState {
	id: number;
	status: 'lobby' | 'night' | 'day' | 'voting' | 'finished';
	current_phase: string;
	day_number: number;
	created_at: string;
	updated_at: string;
}

export interface GameMessage {
	id: string;
	player_id: string;
	player_name: string;
	content: string;
	timestamp: string;
	phase: string;
	is_system: boolean;
}

// Store state
interface StoreState {
	players: GamePlayer[];
	gameState: GameState | null;
	messages: GameMessage[];
	isLoading: boolean;
	error: string | null;
	connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
}

// Create the main store
function createGameStore() {
	const { subscribe, update } = writable<StoreState>({
		players: [],
		gameState: null,
		messages: [],
		isLoading: false,
		error: null,
		connectionStatus: 'disconnected'
	});

	let channel: RealtimeChannel | null = null;
	let messageChannel: RealtimeChannel | null = null;

	// Helper to update specific parts of the store
	const updateStore = (updates: Partial<StoreState>) => {
		update((state) => ({ ...state, ...updates }));
	};

	// Load initial data
	async function loadInitialData() {
		updateStore({ isLoading: true, error: null });

		try {
			// Load all data in parallel
			const [playersResult, stateResult, messagesResult] = await Promise.all([
				supabase.from('game_players').select('*').order('joined_at', { ascending: true }),
				supabase.from('game_state').select('*').single(),
				supabase
					.from('game_messages')
					.select('*')
					.order('timestamp', { ascending: true })
					.limit(100)
			]);

			// Handle players
			if (playersResult.error) throw playersResult.error;

			// Handle game state (might not exist)
			let gameState = null;
			if (stateResult.error) {
				if (stateResult.error.code !== 'PGRST116') {
					console.error('Game state error:', stateResult.error);
				}
			} else {
				gameState = stateResult.data;
			}

			// Handle messages
			const messages = messagesResult.data || [];

			updateStore({
				players: playersResult.data || [],
				gameState,
				messages,
				isLoading: false
			});
		} catch (error) {
			console.error('Error loading initial data:', error);
			updateStore({
				error: error instanceof Error ? error.message : 'Failed to load game data',
				isLoading: false
			});
		}
	}

	// Set up real-time subscriptions
	function setupSubscriptions() {
		updateStore({ connectionStatus: 'connecting' });

		// Main game channel for players and state
		channel = supabase
			.channel('game_channel')
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'game_players' },
				handlePlayerChange
			)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'game_state' },
				handleGameStateChange
			)
			.subscribe((status) => {
				console.log('Game channel status:', status);
				updateStore({
					connectionStatus: status === 'SUBSCRIBED' ? 'connected' : 'connecting'
				});
			});

		// Separate channel for messages (high frequency)
		messageChannel = supabase
			.channel('message_channel')
			.on(
				'postgres_changes',
				{ event: 'INSERT', schema: 'public', table: 'game_messages' },
				handleNewMessage
			)
			.subscribe();
	}

	// Handle player changes
	function handlePlayerChange(payload: RealtimePostgresChangesPayload<GamePlayer>) {
		console.log('Player change:', payload.eventType);

		update((state) => {
			let players = [...state.players];

			switch (payload.eventType) {
				case 'INSERT':
					if (payload.new && !players.find((p) => p.id === payload.new.id)) {
						players.push(payload.new as GamePlayer);
						players.sort(
							(a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
						);
					}
					break;

				case 'UPDATE':
					if (payload.new) {
						const index = players.findIndex((p) => p.id === payload.new.id);
						if (index >= 0) {
							players[index] = payload.new as GamePlayer;
						}
					}
					break;

				case 'DELETE':
					if (payload.old) {
						players = players.filter((p) => p.id !== payload.old.id);
					}
					break;
			}

			return { ...state, players };
		});
	}

	// Handle game state changes
	function handleGameStateChange(payload: RealtimePostgresChangesPayload<GameState>) {
		console.log('Game state change:', payload.eventType, payload.new);

		if (payload.new) {
			updateStore({ gameState: payload.new as GameState });

			// Emit custom event for game phase changes
			const currentState = get({ subscribe });
			const oldStatus = currentState?.gameState?.status;

			// if(Object.keys(obj).lengthpayload.new.status !== {}){}

			if (Object.keys(payload.new) !== 0) {
				if (oldStatus && oldStatus !== payload.new.status) {
					window.dispatchEvent(
						new CustomEvent('gamePhaseChange', {
							detail: {
								oldPhase: oldStatus,
								newPhase: payload.new.status,
								gameState: payload.new
							}
						})
					);
				}
			}
		}
	}

	// Handle new messages
	function handleNewMessage(payload: RealtimePostgresChangesPayload<GameMessage>) {
		if (payload.new) {
			update((state) => ({
				...state,
				messages: [...state.messages, payload.new as GameMessage].slice(-100) // Keep last 100
			}));
		}
	}

	// Cleanup subscriptions
	function cleanup() {
		if (channel) {
			supabase.removeChannel(channel);
			channel = null;
		}
		if (messageChannel) {
			supabase.removeChannel(messageChannel);
			messageChannel = null;
		}
		updateStore({ connectionStatus: 'disconnected' });
	}

	// Initialize the store
	async function initialize() {
		await loadInitialData();
		setupSubscriptions();
	}

	// Public API
	return {
		subscribe,
		initialize,
		cleanup,
		refresh: loadInitialData,

		// Actions with optimistic updates
		async updatePlayer(playerId: string, updates: Partial<GamePlayer>) {
			// Optimistic update
			update((state) => ({
				...state,
				players: state.players.map((p) => (p.id === playerId ? { ...p, ...updates } : p))
			}));

			// Actual update
			const { error } = await supabase.from('game_players').update(updates).eq('id', playerId);

			if (error) {
				console.error('Error updating player:', error);
				// Rollback on error
				await loadInitialData();
				throw error;
			}
		},

		async removePlayer(playerId: string) {
			// Optimistic update
			update((state) => ({
				...state,
				players: state.players.filter((p) => p.id !== playerId)
			}));

			// Actual deletion
			const { error } = await supabase.from('game_players').delete().eq('id', playerId);

			if (error) {
				console.error('Error removing player:', error);
				// Rollback on error
				await loadInitialData();
				throw error;
			}
		},

		async sendMessage(content: string, playerId: string, playerName: string, isSystem = false) {
			const currentState = get({ subscribe });
			const phase = currentState.gameState?.current_phase || 'Lobby';

			const { error } = await supabase.from('game_messages').insert({
				player_id: playerId,
				player_name: playerName,
				content,
				phase,
				is_system: isSystem
			});

			if (error) {
				console.error('Error sending message:', error);
				throw error;
			}
		}
	};
}

// Create singleton instance
export const gameStore = createGameStore();

// Derived stores for specific data
export const players = derived(gameStore, ($game) => $game.players);
export const gameState = derived(gameStore, ($game) => $game.gameState);
export const messages = derived(gameStore, ($game) => $game.messages);
export const connectionStatus = derived(gameStore, ($game) => $game.connectionStatus);

// Derived stores for computed values
export const playersByAffiliation = derived(players, ($players) => {
	const cult = $players.filter((p) => p.affiliation === 'cult');
	const townsfolk = $players.filter((p) => p.affiliation === 'townsfolk');
	const unassigned = $players.filter((p) => !p.affiliation);

	return { cult, townsfolk, unassigned };
});

export const alivePlayers = derived(players, ($players) => $players.filter((p) => p.is_alive));

export const gamePhase = derived(gameState, ($state) => $state?.status || 'lobby');

// Helper functions
export function getPlayer(playerId: string): GamePlayer | undefined {
	const $players = get(players);
	return $players.find((p) => p.id === playerId);
}

export function isGameActive(): boolean {
	const $gameState = get(gameState);
	return $gameState !== null && $gameState.status !== 'lobby' && $gameState.status !== 'finished';
}
