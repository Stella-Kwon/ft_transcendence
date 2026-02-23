import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import fs from "fs";

const keyExists = fs.existsSync("/etc/ssl/certs/key.pem");
const certExists = fs.existsSync("/etc/ssl/certs/cert.pem");

export default defineConfig({
	plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
	preview: {
		headers: 
		{
			"Cross-Origin-Opener-Policy": "unsafe-none",
		},
		open: false,
		https: certExists && keyExists
			?	{
					key: fs.readFileSync("/etc/ssl/certs/key.pem"),
					cert: fs.readFileSync("/etc/ssl/certs/cert.pem"),
				}
			:	{},
		port: 5173,
		strictPort: true,
		host: "0.0.0.0",
	},
	server: {
		port: 5173,
		open: true,
		headers: 
		{
			"Cross-Origin-Opener-Policy": "unsafe-none",
		},
	}
});
