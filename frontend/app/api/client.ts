import { HttpError } from "~/exceptions/HttpError";
import type { FetchError } from "./types";
import { useAuth } from "~/stores/useAuth";

export const fetchJson = async<T> (url: string, options?: RequestInit): Promise<T | null> => {
	// Check if user is logged in before making realtime API calls
	const user = useAuth.getState().user;
	const isRealtimeAPI = url.includes('/api/realtime/');
	
	if (!user && isRealtimeAPI) {
		console.log('User not logged in, skipping realtime API call:', url);
		return null;
	}

	try {
		const response = await fetch(url, { credentials: "include" , ...options });

		if (response.status === 401) {
			useAuth.setState({ user: null });
		}

		if (!response.ok) {
			const err: FetchError = await response.json();
			throw new HttpError(err.message);
		}

		const length = response.headers.get("content-length");

		if (!length || length === "0") {
			return null;
		}

		const data: T = await response.json();
		return data;
	} catch (error) {
		if (error instanceof HttpError) throw error;
		if (error instanceof TypeError) throw new Error("No network connection.");
		if (error instanceof SyntaxError) throw new Error("There was an error processing the information. Please try again.");
		throw new Error("An unexpected error occurred. Please try again later.");
	}
};
