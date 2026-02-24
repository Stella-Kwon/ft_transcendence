import type { GoogleLoginHandler } from "./types";

type GisConfig = {
	clientId: string;
	parent: HTMLElement;
	onLogin: GoogleLoginHandler;
};

const initializeGIS = (config: GisConfig): void => {
	const { clientId, parent, onLogin } = config;

	if (!window.google || !parent) {
		return;
	}

	window.google.accounts.id.initialize({
		client_id: clientId,
		ux_mode: "popup",
		callback: (response) => onLogin(response.credential),
	});

	window.google.accounts.id.renderButton(parent, {
		theme: "outline",
		size: "large",
		width: 200,
		type: "standard",
		text: "signin_with"
	});
};

const loadGIS = (config: GisConfig): void => {
	const { clientId, parent, onLogin } = config;

	const script = document.createElement("script");
	script.src = import.meta.env.VITE_GOOGLE_GIS_CLIENT_URL;
	script.async = true;
	script.defer = true;

	script.onload = () => {
		initializeGIS({ clientId, parent, onLogin });
	};

	script.onerror = () => {
		console.error("❌ Failed to load Google GSI script.");
	};

	document.body.appendChild(script);
};

export const setupGIS = (config: GisConfig): void => {
	if (!window.google) {
		loadGIS(config);
	} else {
		initializeGIS(config);
	}
};
