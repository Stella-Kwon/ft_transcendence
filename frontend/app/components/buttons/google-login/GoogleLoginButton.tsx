import { useEffect, useRef, type JSX } from "react";
import type { GoogleLoginButtonProps } from "./types";
import { setupGIS } from "./setupGIS";

const hasValidClientId = (clientId: string): boolean =>
	!!clientId && clientId !== "undefined" && !clientId.startsWith("your_google");

export function GoogleLoginButton(props: GoogleLoginButtonProps): JSX.Element {
	const divRef = useRef<HTMLDivElement>(null);
	const { clientId, onLogin } = props;

	useEffect(() => {
		if (!divRef.current || !hasValidClientId(clientId)) return;
		setupGIS({ clientId, parent: divRef.current, onLogin });
		return () => {
			window.google?.accounts.id.cancel();
		};
	}, [clientId, onLogin]);

	if (!hasValidClientId(clientId)) {
		return (
			<div className="text-center text-sm text-gray-500 py-2">
				Set VITE_GOOGLE_CLIENT_ID in frontend/.env
			</div>
		);
	}

	return <div ref={divRef}></div>;
}
