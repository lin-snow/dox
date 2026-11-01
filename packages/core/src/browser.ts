/**
 * Browser-safe surface for webview clients.
 *
 * Everything here is `fetch` plus types. The two Node-bound modules — `./config`
 * (`node:fs`, `node:os`, `node:path`) and `./io` (`node:stream`) — are
 * deliberately absent, so a Vite/webview bundle never has to resolve them.
 *
 * Desktop and (future) web builds import this entry; the CLI keeps using the
 * root entry, which includes config/io.
 */
export * from "./http";
export * from "./auth";
export * from "./todo";
export * from "./project";
export * from "./user";
export * from "./invite";
export * from "./event";
export * from "./notifications";
export * from "./time";
