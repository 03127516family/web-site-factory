// 局域网访问辅助：统一 HOST 解析、LAN 地址展示与 Host 头校验。
// 所有本地服务默认监听 0.0.0.0（本机 + 局域网）；设 HOST=127.0.0.1 即缩回仅本机。
// 写接口服务（edit-server 等）面向可信局域网；如接不可信网络请显式 HOST=127.0.0.1。
import { networkInterfaces } from "node:os";
import { isIP } from "node:net";

export function bindHost(fallback = "0.0.0.0") {
  const v = (process.env.HOST || process.env.EDIT_HOST || "").trim();
  return v || fallback;
}

// 本机非回环 IPv4（可能有多个网卡）；IPv6 地址在 URL 里需要加括号，故展示只用 IPv4。
export function lanIPv4s() {
  const found = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list || []) {
      if (info.family === "IPv4" && !info.internal && info.address) found.push(info.address);
    }
  }
  return [...new Set(found)].sort();
}

// 按「实际监听地址」生成可访问 URL。
// 0.0.0.0/:: = 本机 + 全部局域网 IPv4；回环 = 仅 localhost；指定某网卡 IP = 只列该地址。
export function accessUrls(port, path = "/", host = bindHost("0.0.0.0")) {
  const h = String(host || "").trim().toLowerCase();
  if (h === "127.0.0.1" || h === "localhost" || h === "::1") {
    return [`http://localhost:${port}${path}`];
  }
  if (h === "0.0.0.0" || h === "::" || h === "") {
    return [
      `http://localhost:${port}${path}`,
      ...lanIPv4s().map((ip) => `http://${ip}:${port}${path}`),
    ];
  }
  const formatted = h.includes(":") && !h.startsWith("[") ? `[${h}]` : h;
  return [`http://${formatted}:${port}${path}`];
}

// 从 Host 头取主机名（去掉端口，IPv6 去掉方括号）。非法/缺失返回 null。
function hostnameOf(hostHeader) {
  const h = String(hostHeader || "").trim().toLowerCase();
  if (!h) return null;
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    if (end < 0) return null;
    return h.slice(1, end);
  }
  const i = h.lastIndexOf(":");
  return i > 0 ? h.slice(0, i) : h;
}

function matchesPattern(name, pattern) {
  if (pattern === "*") return true;
  const re = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${re}$`).test(name);
}

// 编辑服务的 Host 白名单（防 DNS rebinding / 跨站直打）：
// 本机名、任何 IP 字面量、.local mDNS 名默认放行；任意公网域名仍拒绝。
// 其他主机名可用 ALLOWED_HOSTS=* 或逗号列表（支持 * 通配）放行。
// 仍比「只放 localhost」宽——这是「编辑服务要能局域网访问」与安全底线的折中；
// 接不可信网络时用 HOST=127.0.0.1 从监听层直接缩回。
export function lanHostAllowed(hostHeader, { allowedHosts = process.env.ALLOWED_HOSTS || "" } = {}) {
  const name = hostnameOf(hostHeader);
  if (!name) return false;

  if (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name === "127.0.0.1" ||
    name === "::1"
  ) {
    return true;
  }

  // IPv4/IPv6 字面量统一放行：绑定范围由 HOST 决定；白名单在这里只拦「域名型」DNS rebinding。
  if (isIP(name) !== 0) return true;

  if (name.endsWith(".local")) return true;

  const extras = String(allowedHosts).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return extras.some((pattern) => matchesPattern(name, pattern));
}
