import { loadConfig, loadDotEnv } from "./config.js";
import { createWebServer } from "./app.js";

loadDotEnv();
const cfg = loadConfig();
const srv = createWebServer(cfg);
const { port } = await srv.start();
console.log(`AegisClear console: http://localhost:${port}  (network ${cfg.network}, chain ${cfg.chainId}, factory ${cfg.deployment.factory})`);
process.on("SIGINT", () => { void srv.stop().then(() => process.exit(0)); });
