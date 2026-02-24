import { fetchJson } from '../client';
import type { CreateTournamentDto, JoinTournamentDto, TournamentResponse, TournamentsResponse, RecordTournamentResultsDto } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://localhost:3000/api';

// //25.7
// export async function createTournament(tournamentData: CreateTournamentDto): Promise<TournamentResponse | null> {
// 	try {
// 		const response = await fetchJson<TournamentResponse>(`${API_BASE_URL}/tournament`, {
// 			method: 'POST',
// 			headers: {
// 				'Content-Type': 'application/json',
// 			},
// 			body: JSON.stringify(tournamentData),
// 		});
// 		return response;
// 	} catch (error) {
// 		console.error('Failed to create tournament:', error);
// 		throw error;
// 	}
// }


// export async function getTournaments(): Promise<TournamentsResponse> {
// 	try {
// 		const response = await fetchJson(`${API_BASE_URL}/tournament/find-open-tournament`);
// 		return response;
// 	} catch (error) {
// 		console.error('Failed to get tournaments:', error);
// 		throw error;
// 	}
// }

// export async function joinTournament(joinData: JoinTournamentDto): Promise<TournamentResponse> {
// 	try {
// 		const response = await fetchJson(`${API_BASE_URL}/tournament/join-tournament`, {
// 			method: 'POST',
// 			headers: {
// 				'Content-Type': 'application/json',
// 			},
// 			body: JSON.stringify(joinData),
// 		});
// 		return response;
// 	} catch (error) {
// 		console.error('Failed to join tournament:', error);
// 		throw error;
// 	}
// }


// Note: No backend route exists for getting tournament by ID
// export async function getTournament(tournamentId: string): Promise<TournamentResponse> {
// 	try {
// 		const response = await fetchJson(`${API_BASE_URL}/tournament/${tournamentId}`);
// 		return response;
// 	} catch (error) {
// 		console.error('Failed to get tournament:', error);
// 		throw error;
// 	}
// }

export async function recordTournamentResults(resultsData: RecordTournamentResultsDto): Promise<TournamentResponse> {
// dont need try and catch and fetchJson already do.
	const response = await fetchJson<TournamentResponse>(`${API_BASE_URL}/api/tournament/record-tournament`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(resultsData),
	});
	return response || { success: false, message: 'No response received' };
} 