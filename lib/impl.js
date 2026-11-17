// mcii-jiejia — 解甲（直连版）
//
// 与「无限五代」的差别：
//   · 装上即生效，默认全模式（不需要先选预设）
//   · 只注入，不参与输出回路：没有 W5 / T4 / 归一化，没有会话徽标
//   · 界面只有一个开关（全模式注入）+ 一个清理按钮
//
// 注入三件事：
//   1. 遮蔽宿主身份段与人格段（harness:identity / deployment:persona-*）
//   2. 插入解甲三段：persona-prefix(order 0) / 解甲核(order 100) / 封口(order 10200)
//   3. 清空运行时上下文
//
// 每个 mount 自带一份状态（session），互不干扰：常驻实例与预设实例可以同时挂载，
// 只有当前该负责的那个在注入。

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const BUILD_STAMP = "__STAMP__";

const VERSION = "1.1.0";
const HOME = process.env.DSH_HOME || join(homedir(), ".dsh");
const LEGACY_STATE_FILE = join(HOME, ".dsh-armor-one.json");
const STATE_FILE = join(HOME, ".mcii-jiejia.json");
const STATUS_FILE = join(HOME, ".mcii-jiejia-status.json");

function loadPrompt(file) {
  try {
    return readFileSync(new URL("../prompts/" + file, import.meta.url), "utf8").trim();
  } catch {
    return "";
  }
}

const PROMPT_TEXT = loadPrompt("armor.md");
const PREFIX_TEXT = loadPrompt("prefix.md");
const SEAL_TEXT = loadPrompt("seal.md");
const PROMPT_HASH = createHash("sha256").update(PROMPT_TEXT).digest("hex");
const BUILD = "b5-" + Date.now().toString(36);

// 热重载会留下旧模块实例。诊断/会话登记一律走全局草稿，旧实例的路由也能读到最新状态。
const shared = (globalThis.__armorOne ??= { sessions: [], snapshot: null });
if (!Array.isArray(shared.sessions)) shared.sessions = [];

// ---- 持久状态：{ allModes, paused } ----
function readStateSource() {
  for (const file of [STATE_FILE, LEGACY_STATE_FILE]) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      if (raw !== null && typeof raw === "object") return raw;
    } catch {
      // 继续试下一个（新名字 → 旧文件名，兼容从 dsh-armor-one 升级上来的状态）
    }
  }
  return null;
}

function readState() {
  try {
    const raw = readStateSource();
    if (raw !== null && typeof raw === "object") {
      return {
        allModes: typeof raw.allModes === "boolean" ? raw.allModes : true,
        paused: raw.paused === true,
      };
    }
  } catch {
    // 文件缺失或损坏：回落默认（全模式开 = 直接破甲）
  }
  return { allModes: true, paused: false };
}

function writeState(next) {
  const merged = { ...readState(), ...next };
  try {
    writeFileSync(
      STATE_FILE,
      JSON.stringify({ allModes: merged.allModes, paused: merged.paused, updatedAt: new Date().toISOString() }, null, 2) + "\n",
    );
    return true;
  } catch (error) {
    console.error("[mcii-jiejia] 写状态失败:", error);
    return false;
  }
}

// ---- 宿主段落表 ----
const COVER_HINTS = [/^harness:identity$/, /^deployment:persona-prefix$/, /^deployment:persona-suffix$/, /identity/i, /persona/i];
const NEVER_COVER = [/^harness:source$/, /^app:web-surface$/, /^ui:/, /^mcp-/, /^tool-/, /^mnemon:/, /^dsh-ops:/, /^tools:/];

function tableOf(ctx) {
  try {
    const layers = ctx && ctx.systemPrompt && ctx.systemPrompt.layers;
    const sections = layers && layers.global && layers.global.sections;
    const data = sections && sections.data;
    if (data instanceof Map) return { sections, data };
  } catch {
    // 宿主结构变化：降级为只追加，不遮蔽
  }
  return null;
}

function shouldCover(sectionName) {
  if (!sectionName || sectionName.startsWith("jiejia:")) return false;
  // 热重载期间可能同时存在两代实例：对方不认识我的段名，只看 /persona/i 就会把我的段置空。
  // 任何带 jiejia 的名字都不是宿主段。
  if (/jiejia/i.test(sectionName)) return false;
  for (const re of NEVER_COVER) if (re.test(sectionName)) return false;
  for (const re of COVER_HINTS) if (re.test(sectionName)) return true;
  return false;
}

function newSession(ctx, config) {
  return {
    ctx,
    build: BUILD,
    preset: config !== null && typeof config === "object" && (config.via === "preset" || config.mode === "armor"),
    injecting: false,
    disposers: [],
    owned: new Set(),
    adopted: new Set(),
    originals: new Map(),
    runtime: { injected: false, covered: [], skipped: [], scanned: 0, suppressed: false, errors: [] },
    hostRows: [],
  };
}

function scan(session) {
  const table = tableOf(session.ctx);
  if (!table) return [];
  session.runtime.scanned = 0;
  const rows = [];
  table.sections.entries().forEach(([key, section]) => {
    if (key.startsWith("jiejia:")) return;
    session.runtime.scanned += 1;
    rows.push({ name: key, order: Number.isFinite(section && section.order) ? section.order : 0, cover: shouldCover(key) });
  });
  rows.sort((a, b) => a.order - b.order);
  return rows;
}

function coverHost(session) {
  const table = tableOf(session.ctx);
  session.runtime.covered = [];
  session.runtime.skipped = [];
  if (!table) return session.runtime;
  for (const row of session.hostRows) {
    if (!row.cover) continue;
    const original = table.data.get(row.name);
    if (!original) {
      session.runtime.skipped.push(row.name);
      continue;
    }
    if (original.complete === true) {
      // complete 段是「唯一提示词」，清空等于抹掉整个系统提示，跳过
      session.runtime.skipped.push(row.name);
      continue;
    }
    if (!session.originals.has(row.name)) session.originals.set(row.name, original);
    try {
      table.data.set(row.name, { ...original, text: "" });
      session.runtime.covered.push(row.name);
    } catch (error) {
      session.runtime.errors.push(row.name + ": " + String((error && error.message) || error));
    }
  }
  return session.runtime;
}

function restoreHost(session) {
  const table = tableOf(session.ctx);
  let restored = 0;
  if (!table) return 0;
  for (const [key, section] of session.originals.entries()) {
    try {
      table.data.set(key, section);
      restored += 1;
    } catch {
      // 宿主已重建表，放弃还原
    }
  }
  session.originals.clear();
  session.runtime.covered = [];
  return restored;
}

// 段落注册三态：
//   registered —— 本次登记成功，卸载时撤掉
//   adopted    —— 表里已有同名段（旧实例/预设实例登记过），就地改写，卸载时置空
//   failed     —— 登记失败且无表可写
function putSection(session, spec) {
  const table = tableOf(session.ctx);
  const write = () => {
    const current = (table && table.data.get(spec.name)) || {};
    table.data.set(spec.name, { ...current, name: spec.name, order: spec.order, text: spec.text });
  };

  if (table && table.data.has(spec.name)) {
    try {
      write();
      session.adopted.add(spec.name);
      return "adopted";
    } catch {
      // 落到登记路径
    }
  }

  try {
    const disposer = session.ctx.systemPrompt.section(spec);
    session.disposers.push(() => {
      try {
        if (typeof disposer === "function") disposer();
      } catch {
        // 宿主已销毁
      }
    });
    session.owned.add(spec.name);
    return "registered";
  } catch (error) {
    const message = String((error && error.message) || error);
    if (table && message.indexOf("already registered") >= 0) {
      try {
        write();
        session.adopted.add(spec.name);
        return "adopted";
      } catch {
        // 落到错误
      }
    }
    session.runtime.errors.push("section " + spec.name + ": " + message);
    return "failed";
  }
}

// 只注册一段：任何按名字前缀/正则识别"人格段"的外来逻辑都无从下手，
// 也就不会在装配阶段被别的实例置空。顺序上它落在宿主身份段之后、固定尾巴之前。
const COMBINED_TEXT = [PREFIX_TEXT, PROMPT_TEXT, SEAL_TEXT].filter(Boolean).join("\n\n");

function partSpecs() {
  const parts = [];
  if (COMBINED_TEXT) parts.push({ name: "jiejia:core", order: 100, text: COMBINED_TEXT });
  return parts;
}

// 自愈：热重载遗留的旧实例在 dispose 时会把同名段置空。每轮把三段重新写回原文。
function assertParts(session) {
  const table = tableOf(session.ctx);
  if (!table) return;
  for (const spec of partSpecs()) {
    const current = table.data.get(spec.name);
    if (!current) continue;
    if (current.text === spec.text) continue;
    try {
      table.data.set(spec.name, { ...current, order: spec.order, text: spec.text });
    } catch {
      // 表不可写
    }
  }
}

// 上一代版本注册过的段（jiejia:persona-prefix / jiejia:persona-suffix）会留在表里被反复置空，
// 单段方案启用时顺手把它们清掉，避免提示词里出现两条空壳记录。
const LEGACY_PARTS = ["jiejia:persona-prefix", "jiejia:persona-suffix"];

function dropLegacyParts(session) {
  const table = tableOf(session.ctx);
  if (!table) return;
  for (const name of LEGACY_PARTS) {
    try {
      table.data.delete(name);
    } catch {
      // 表不可写：留着也无害（文本为空）
    }
  }
}

function activate(session) {
  const runtime = session.runtime;
  runtime.errors = [];
  runtime.injected = false;
  session.hostRows = scan(session);
  coverHost(session);
  dropLegacyParts(session);

  const parts = partSpecs();
  let placed = 0;
  for (const spec of parts) {
    if (putSection(session, spec) !== "failed") placed += 1;
  }

  try {
    session.disposers.push(session.ctx.systemPrompt.suppressRuntimeContext());
    runtime.suppressed = true;
  } catch (error) {
    runtime.suppressed = false;
    runtime.errors.push("suppressContext: " + String((error && error.message) || error));
  }

  runtime.injected = placed === parts.length && parts.length > 0;
  session.injecting = true;
  return true;
}

function deactivate(session) {
  const table = tableOf(session.ctx);
  if (table) {
    for (const name of session.adopted) {
      try {
        const current = table.data.get(name);
        if (current) table.data.set(name, { ...current, text: "" });
      } catch {
        // 表不可写
      }
    }
  }
  session.adopted.clear();
  session.owned.clear();
  while (session.disposers.length > 0) {
    const dispose = session.disposers.pop();
    try {
      if (typeof dispose === "function") dispose();
    } catch {
      // 单个释放失败不阻塞其余
    }
  }
  restoreHost(session);
  session.runtime.injected = false;
  session.runtime.suppressed = false;
  session.injecting = false;
}

// ---- 快照：按最新一批实例聚合 ----
function newestBuild() {
  let best = "";
  for (const session of shared.sessions) if (String(session.build) > best) best = String(session.build);
  return best;
}

function liveSessions() {
  // 热重载会留下多个代际的实例；只取最新一代会把「挂在无会话上下文里的空实例」当成全体，
  // 于是面板显示 scanned 0 / 未注入。这里改成：任一代际里只要真的有会话表，就以它为准。
  const all = shared.sessions.filter((session) => session && session.ctx);
  if (all.length === 0) return all;
  const ranked = all.slice().sort((a, b) => {
    const aScore = (a.injecting ? 1000 : 0) + (a.runtime && a.runtime.scanned ? 100 : 0) + (String(a.build) > String(b.build) ? 1 : 0);
    const bScore = (b.injecting ? 1000 : 0) + (b.runtime && b.runtime.scanned ? 100 : 0) + (String(b.build) > String(a.build) ? 1 : 0);
    return bScore - aScore;
  });
  const best = ranked[0];
  const bestBuild = String(best.build);
  const sameGen = all.filter((session) => String(session.build) === bestBuild);
  return sameGen.indexOf(best) >= 0 ? sameGen : [best];
}

function buildSnapshot() {
  const state = readState();
  const live = liveSessions();
  const active = live.filter((session) => session.injecting);
  const source = active[0] || live[0];
  const runtime = source ? source.runtime : { injected: false, covered: [], skipped: [], scanned: 0, suppressed: false, errors: [] };
  const errors = [];
  for (const session of live) for (const line of session.runtime.errors) if (errors.indexOf(line) < 0) errors.push(line);
  return {
    ok: true,
    name: "mcii-jiejia",
    version: VERSION,
    build: BUILD,
    instances: live.length,
    allModes: state.allModes,
    paused: state.paused,
    modes: state.paused ? "off" : state.allModes ? "all" : "preset",
    promptHash: PROMPT_HASH,
    promptChars: PROMPT_TEXT.length,
    injected: active.length > 0,
    covered: runtime.covered,
    skipped: runtime.skipped,
    scanned: runtime.scanned,
    suppressed: Boolean(runtime.suppressed),
    errors,
    stateFile: STATE_FILE,
  };
}

function publish() {
  try {
    shared.snapshot = buildSnapshot();
    writeFileSync(STATUS_FILE, JSON.stringify({ ...shared.snapshot, at: new Date().toISOString() }, null, 2) + "\n");
  } catch {
    // 写不了就只走路由
  }
}

function snapshot() {
  // 热重载后旧实例仍在发布旧结构快照，读的时候重算一次，保证面板看到的是新结构
  const fresh = buildSnapshot();
  shared.snapshot = fresh;
  try {
    writeFileSync(STATUS_FILE, JSON.stringify({ ...fresh, at: new Date().toISOString() }, null, 2) + "\n");
  } catch {
    // 写不了就只走路由
  }
  return fresh;
}

// ---- HTTP 路由（面板读写）----
function registerRoute(ctx) {
  let webServer;
  try {
    webServer = ctx.get("webServer");
  } catch {
    webServer = undefined;
  }
  if (!webServer || typeof webServer.register !== "function") return false;

  const send = (res, code, payload) => {
    try {
      res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(payload));
    } catch {
      // 连接已断
    }
  };

  const handler = (req, res) => {
    try {
      const path = String(req.url || "").split("?")[0];

      if (path === "/armor-one/state" || path === "/armor-one/v5/state" || path === "/armor-one/v6/state") {
        send(res, 200, snapshot());
        return;
      }

      if ((path === "/armor-one/mode" || path === "/armor-one/v5/mode" || path === "/armor-one/v6/mode") && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
          if (body.length > 2048) req.destroy();
        });
        req.on("end", () => {
          let allModes = null;
          try {
            const parsed = JSON.parse(body || "{}");
            if (typeof parsed.allModes === "boolean") allModes = parsed.allModes;
          } catch {
            allModes = null;
          }
          if (allModes === null) {
            send(res, 400, { ok: false, error: "allModes: boolean required" });
            return;
          }
          // 打开开关同时解除「清理注入」造成的暂停
          const ok = writeState({ allModes, paused: allModes ? false : readState().paused });
          for (const session of liveSessions()) {
            try {
              reconcile(session);
            } catch {
              // 下一轮轮询兜底
            }
          }
          send(res, ok ? 200 : 500, snapshot());
        });
        return;
      }

      if ((path === "/armor-one/off" || path === "/armor-one/v5/off" || path === "/armor-one/v6/off") && req.method === "POST") {
        // 清理注入：立刻停掉所有实例的注入并记下暂停，重启后也不会自己回来
        const ok = writeState({ paused: true });
        let restored = 0;
        for (const session of liveSessions()) {
          try {
            restored += restoreHost(session);
            deactivate(session);
          } catch {
            // 单个实例失败不影响其它
          }
        }
        send(res, ok ? 200 : 500, { ...snapshot(), restored });
        return;
      }

      if (path === "/armor-one/debug" || path === "/armor-one/v5/debug" || path === "/armor-one/v6/debug") {
        const table = tableOf(ctx);
        const rows = [];
        if (table) {
          table.sections.entries().forEach(([key, section]) => {
            const text = section && section.text;
            rows.push({
              name: key,
              order: section && section.order,
              len: typeof text === "string" ? text.length : typeof text === "function" ? "fn" : 0,
              head: typeof text === "string" ? text.slice(0, 40) : "",
            });
          });
        }
        send(res, 200, { ok: true, rows, prefixLen: PREFIX_TEXT.length, sealLen: SEAL_TEXT.length, coreLen: PROMPT_TEXT.length });
        return;
      }

      send(res, 404, { ok: false, error: "not-found" });
    } catch (error) {
      send(res, 500, { ok: false, error: String((error && error.message) || error) });
    }
  };

  // 路由只登记一次（谁先占到就是谁），但一律转交给「当前最新的处理器」。
  // 否则热重载后旧实例继续占着 /state，面板读到的是上一代代码和上一代的会话，
  // 表现就是版本号不动、injected/scanned 永远是 0。
  shared.handler = handler;

  // 每条路由独立登记：热重载后旧实例的同名路由可能还占着位，一条失败不能连坐其它条。
  const routes = [
    "/armor-one/v6/state",
    "/armor-one/v6/mode",
    "/armor-one/v6/off",
    "/armor-one/v6/debug",
    "/armor-one/v5/state",
    "/armor-one/v5/mode",
    "/armor-one/v5/off",
    "/armor-one/v5/debug",
    "/armor-one/state",
    "/armor-one/mode",
    "/armor-one/off",
    "/armor-one/debug",
  ];
  for (const path of routes) {
    const relay = (req, res) => {
      const current = shared.handler || handler;
      try {
        current(req, res);
      } catch (error) {
        send(res, 500, { ok: false, error: String((error && error.message) || error) });
      }
    };
    try {
      ctx.effect(() => webServer.register({ kind: "exact", path, handler: relay }), "jiejia: " + path);
    } catch {
      // 该路径被旧实例占用：跳过
    }
  }

  const publisher = setInterval(publish, 2000);
  if (publisher && typeof publisher.unref === "function") publisher.unref();
  try {
    ctx.effect(() => () => clearInterval(publisher), "jiejia: publisher");
  } catch {
    // 无 effect：unref 自然退出
  }
  return true;
}

// ---- 谁负责注入 ----
function reconcile(session) {
  if (session.injecting) {
    try {
      assertParts(session);
    } catch {
      // 自愈失败不阻塞
    }
  }
  const state = readState();
  const want = state.paused ? false : session.preset ? state.allModes === false : state.allModes === true;
  if (want && !session.injecting) {
    try {
      activate(session);
    } catch (error) {
      session.injecting = false;
      session.runtime.errors.push("activate: " + String((error && error.message) || error));
    }
    return;
  }
  if (!want && session.injecting) {
    try {
      deactivate(session);
    } catch {
      // 卸载异常不阻塞切换
    }
  }
}

export function mount(ctx, config) {
  const session = newSession(ctx, config);
  shared.sessions.push(session);

  const wireRoutes = () => {
    try {
      registerRoute(ctx);
    } catch (error) {
      console.error("[mcii-jiejia] 路由注册失败:", error);
    }
  };
  wireRoutes();
  try {
    if (typeof ctx.inject === "function") ctx.inject(["webServer"], wireRoutes);
  } catch {
    // 宿主子集没有 inject：靠上面的直接尝试
  }

  reconcile(session);

  // 宿主每轮都会重新登记 deployment:persona-* 这类段，单次覆盖会被下一轮盖回来。
  // 装配钩子：装配前再盖一遍，装配后把残留抹平。
  try {
    ctx.on("system-prompt/assemble", async (presentation, assembleContext, next) => {
      try {
        if (session.injecting) {
          coverHost(session);
          assertParts(session);
        }
      } catch {
        // 覆盖失败不阻塞装配
      }
      const result = await next();
      try {
        if (session.injecting && result && Array.isArray(result.sections)) {
          const own = new Map(partSpecs().map((spec) => [spec.name, spec.text]));
          result.sections = result.sections.map((section) => {
            const key = section && section.name;
            if (typeof key !== "string") return section;
            // 我方段：无论谁在装配过程中把它清空（同进程里可能还挂着旧一代实例，
            // 它按 /persona/i 认段名，会把 jiejia:persona-* 当宿主段抹掉），这里原样写回
            if (own.has(key)) return { ...section, text: own.get(key) };
            if (!shouldCover(key)) return section;
            if (section.complete === true) return section;
            return { ...section, text: "" };
          });
        }
      } catch {
        // 装配结果不可写：保留表格覆盖的效果
      }
      return result;
    });
  } catch (error) {
    session.runtime.errors.push("assemble-hook: " + String((error && error.message) || error));
  }

  const timer = setInterval(() => {
    try {
      reconcile(session);
    } catch (error) {
      session.runtime.errors.push("reconcile: " + String((error && error.message) || error));
    }
  }, 2000);
  if (timer && typeof timer.unref === "function") timer.unref();

  try {
    ctx.effect(
      () => () => {
        clearInterval(timer);
        try {
          deactivate(session);
        } catch {
          // 宿主已销毁
        }
        const index = shared.sessions.indexOf(session);
        if (index >= 0) shared.sessions.splice(index, 1);
        publish();
      },
      "jiejia: lifecycle",
    );
  } catch {
    // effect 不可用：靠 timer.unref 自然退出
  }

  publish();
}
