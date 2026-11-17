
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const home = mkdtempSync(join(tmpdir(), "armor-one-"));
process.env.DSH_HOME = home;
const stateFile = join(home, ".mcii-jiejia.json");
const setState = (o) => writeFileSync(stateFile, JSON.stringify(o));

function makeCtx() {
  const sections = new Map();
  sections.set("harness:identity", { name: "harness:identity", order: -1000, text: "You are a coding agent." });
  sections.set("deployment:persona-prefix", { name: "deployment:persona-prefix", order: 0, text: "You are a coding agent powered by {{model}}." });
  sections.set("deployment:persona-suffix", { name: "deployment:persona-suffix", order: 10200, text: "</persona>" });
  sections.set("tool:read", { name: "tool:read", order: 4000, text: "read tool" });
  const registered = new Set();
  let suppressed = false;
  const ctx = {
    systemPrompt: {
      layers: { global: { sections: { data: sections, entries: () => sections.entries() } } },
      section(spec) {
        if (registered.has(spec.name)) throw new Error('prompt section "' + spec.name + '" is already registered');
        registered.add(spec.name);
        sections.set(spec.name, { ...spec });
        return () => { registered.delete(spec.name); sections.delete(spec.name); };
      },
      suppressRuntimeContext() { suppressed = true; return () => { suppressed = false; }; },
    },
    on() { return () => {}; },
    effect(fn) { return () => {}; },
    get() { return undefined; },
    inject() {},
  };
  ctx.read = () => ({ sections, suppressed });
  return ctx;
}

const implUrl = new URL("./lib/impl.js", import.meta.url);
implUrl.search = "?t=" + Date.now();
const impl = await import(implUrl.href);

function describe(ctx) {
  const { sections, suppressed } = ctx.read();
  const get = (k) => sections.get(k);
  return {
    identity: JSON.stringify(get("harness:identity")?.text ?? null),
    personaP: JSON.stringify(get("deployment:persona-prefix")?.text ?? null),
    personaS: JSON.stringify(get("deployment:persona-suffix")?.text ?? null),
    core: Boolean(get("jiejia:core")),
    coreLen: (get("jiejia:core")?.text || "").length,
    prefix: Boolean(get("jiejia:head")),
    seal: Boolean(get("jiejia:tail")),
    suppressed,
    toolRead: (get("tool:read")?.text || "").slice(0, 4),
  };
}

// A. 全模式开（默认）
setState({ allModes: true });
const a = makeCtx();
impl.mount(a, {});
await new Promise((r) => setTimeout(r, 60));
console.log("A 全模式开    ", JSON.stringify(describe(a)));

// B. 关闭全模式（预设实例才注入；常驻实例撤掉）
setState({ allModes: false });
await new Promise((r) => setTimeout(r, 2200));
console.log("B 全模式关    ", JSON.stringify(describe(a)));

// C. 预设实例在 allModes=false 时注入
const c = makeCtx();
impl.mount(c, { mode: "armor", via: "preset" });
await new Promise((r) => setTimeout(r, 60));
console.log("C 预设实例    ", JSON.stringify(describe(c)));

// D. 全模式再开：预设实例应撤掉，常驻实例恢复
setState({ allModes: true });
await new Promise((r) => setTimeout(r, 2400));
console.log("D 再开·常驻   ", JSON.stringify(describe(a)));
console.log("D 再开·预设   ", JSON.stringify(describe(c)));

// E. 清理注入（paused）
setState({ allModes: true, paused: true });
await new Promise((r) => setTimeout(r, 2400));
console.log("E 清理后·常驻 ", JSON.stringify(describe(a)));
process.exit(0);
