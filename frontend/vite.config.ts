import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import fs from "fs";
import path from "path";

const certDirs = ["/etc/ssl/certs", path.resolve(process.cwd(), "certs")];

const findCerts = () => {
	for (const dir of certDirs) {
		const keyPath = path.join(dir, "key.pem");
		const certPath = path.join(dir, "cert.pem");
		if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
			return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
		}
	}
	throw new Error("SSL certificates not found. Run with Docker or place certs in ./certs/");
};

const https = findCerts();

export default defineConfig({
	plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
	preview: {
		headers: {
			"Cross-Origin-Opener-Policy": "unsafe-none",
		},
		open: false,
		https,
		port: 5173,
		strictPort: true,
		host: "0.0.0.0",
	},
	server: {
		port: 5173,
		open: true,
		https,
		headers: {
			"Cross-Origin-Opener-Policy": "unsafe-none",
		},
	},
});
