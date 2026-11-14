import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Share the repo-root .env with the agent (Next only reads .env files inside this folder).
const root = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(root)) process.loadEnvFile(root);

/** @type {import('next').NextConfig} */
export default { transpilePackages: ["@syllabus-crew/core"], reactStrictMode: true, agentRules: false };
