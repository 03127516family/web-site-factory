// 站点工作台 · 总入口：一条命令起全部服务
//   node design/admin-ui/start.mjs
//   → 8090 工作台（数据层 + 界面）  → 8092 编辑服务（页面即编辑器 + 烧制 + 流水线）
// 退出（Ctrl+C / SIGTERM）时全部子进程一并停掉。
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bindHost, accessUrls } from "../../scripts/lan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const HOST = bindHost("0.0.0.0");

const children = [
  { name: "工作台 8090", proc: spawn("node", ["design/admin-ui/server.mjs"], { cwd: ROOT, stdio: "inherit" }) },
  { name: "编辑服务 8092", proc: spawn("npm", ["run", "edit"], { cwd: join(ROOT, "site"), stdio: "inherit", shell: true }) },
];

const shutdown = () => {
  console.log("\n[总入口] 停止全部服务…");
  for (const { proc } of children) {
    try { proc.kill("SIGTERM"); } catch { /* 已退出 */ }
  }
  // 给子进程 2 秒善后时间
  setTimeout(() => process.exit(0), 2000);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
for (const { name, proc } of children) {
  proc.on("exit", (code) => console.log(`[总入口] ${name} 退出（code ${code}）`));
}
console.log("[总入口] 全部服务启动中 → 工作台 " + accessUrls(8090, "/", HOST).join("  ") + " · 编辑服务 " + accessUrls(8092, "/", HOST).join("  "));
