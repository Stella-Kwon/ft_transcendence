import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";


import "./app.css";
import "./utils/i18n";
import { Toaster, toast } from "react-hot-toast";
import { whoami } from "./api/auth/whoami";
import { useAuth } from "./stores/useAuth";
import type { Route } from "./+types/root";

export async function clientLoader(): Promise<void> {
	try {
		const { message, user } = await whoami();
		useAuth.setState({ user });

		if (message) {
			toast(message, {
				icon: 'ℹ️',
				style: {
					background: '#e0f2fe',
					color: '#0369a1',
				},
			});
		}
	} catch (error) {
		useAuth.setState({ user: null });
		toast.error((error as Error).message);
	}
}

export function HydrateFallback() {
	return <p>Loading Game...</p>;
}

export const links: Route.LinksFunction = () => [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous",
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
	},

];

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body suppressHydrationWarning={true}>
				{children}
				<div id="portal"></div>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return (
		<>
			<Toaster position="top-right" />
			<Outlet />
		</>
	);
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;

	// Log every error for inspection
	console.error("⚠️ Route Error Caught:", error);

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "404" : "Error";
		details =
			error.status === 404
				? "The requested page could not be found."
				: error.statusText || details;

		console.warn("❓ Route error details:", {
			status: error.status,
			statusText: error.statusText,
			data: error.data,
		});
	} else if (import.meta.env.DEV && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main className="pt-16 p-4 container mx-auto">
			<h1>{message}</h1>
			<p>{details}</p>
			{stack && (
				<pre className="w-full p-4 overflow-x-auto">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
}
