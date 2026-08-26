#!/usr/bin/env node
// 工作台总入口：一条命令起全部服务（8090 工作台 + 8092 编辑服务），退出全停。
// 要求 node ≥22（8092 的 astro build 需要）。
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bindHost, accessUrls } from "./lan.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = bindHost("0.0.0.0");
const PORT = process.env.WORKBENCH_PORT || "8090";

const children = [
  { name: `工作台 ${PORT}`, proc: spawn(process.execPath, ["workbench/server.mjs"], { cwd: SITE, stdio: "inherit", env: { ...process.env, WORKBENCH_PORT: PORT } }) },
  { name: "编辑服务 8092", proc: spawn("npm", ["run", "edit"], { cwd: SITE, stdio: "inherit", shell: true }) },
];

const shutdown = () => {
  console.log("\n[总入口] 停止全部服务…");
  for (const { proc } of children) { try { proc.kill("SIGTERM"); } catch { /* 已退出 */ } }
  setTimeout(() => process.exit(0), 2000);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
for (const { name, proc } of children) proc.on("exit", (code) => console.log(`[总入口] ${name} 退出（code ${code}）`));
console.log("[总入口] 全部服务启动中 → 工作台 " + accessUrls(Number(PORT), "/", HOST).join("  ") + " · 编辑服务 " + accessUrls(8092, "/", HOST).join("  "));
