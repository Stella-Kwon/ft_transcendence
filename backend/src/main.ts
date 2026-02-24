import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { createApp } from "./app";
import { ServerOptions } from "https";

const certDirs = ["/etc/ssl/certs", join(process.cwd(), "certs")];

const findCerts = (): ServerOptions => {
	for (const dir of certDirs) {
		const keyPath = join(dir, "key.pem");
		const certPath = join(dir, "cert.pem");
		if (existsSync(keyPath) && existsSync(certPath)) {
			return {
				key: readFileSync(keyPath),
				cert: readFileSync(certPath),
			};
		}
	}
	throw new Error("SSL certificates not found. Run with Docker or place certs in ./certs/");
};

const start = async (): Promise<void> => {
	const httpsOptions: ServerOptions = findCerts();

	try {
		const app = await createApp({
			https: httpsOptions,
			logger: {
				transport: {
					target: "pino-pretty",
					options: {
						colorize: true,
						translateTime: "SYS:standard",
						ignore: "pid,hostname"
					}
				}
			},
			pluginTimeout: 10000
		});

		const port = process.env.PORT ? Number(process.env.PORT) : 3000;
		await app.listen({ port, host: "0.0.0.0" });
		console.log(app.printRoutes());
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
};

start();