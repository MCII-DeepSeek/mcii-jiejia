// mcii-jiejia（解甲）— 稳定入口（新文件：换 URL 才能摆脱宿主里缓存的旧模块）
//
// 宿主的热重载会重新执行 apply，但不一定重新 import 入口模块（ESM 缓存）。
// 所以入口只做一件事：每次 apply 时用带时间戳的 URL 重新 import 实��文件，
// 保证改完 lib/impl.js 只要触发一次 patch reload 就生效。
import { statSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TRACE = join(process.env.DSH_HOME || join(homedir(), ".dsh"), ".mcii-jiejia-boot.log");
function trace(message) {
  try {
    appendFileSync(TRACE, new Date().toISOString() + " " + message + "\n");
  } catch {
    // 只做诊断
  }
}

export const name = "mcii-jiejia";
export const inject = ["systemPrompt"];

const IMPL = new URL("./impl.js", import.meta.url);

// URL 里那个递增计数；没有它 ++BOOT 会抛 ReferenceError，被 catch 吃掉 → stamp 永远是 "0"
let BOOT = 0;

export async function apply(ctx, config) {
  trace("entry apply start");
  // stamp 必须是「文件内容变了就一定变」的串。旧写法 stats.mtimeMs|0 会截断成 int32，
  // 一旦和进程里已缓存的某个 URL 撞值，import() 就命中 ESM 缓存、新代码永远不生效。
  let stamp = "0";
  try {
    const stats = statSync(IMPL);
    stamp = stats.size + "-" + Math.round(stats.mtimeMs) + "-" + (++BOOT);
  } catch {
    // 读不到 mtime：仍用无查询串加载
  }
  const url = new URL(IMPL);
  url.search = "?v=" + stamp;
  trace("importing " + url.href);
  let impl;
  try {
    impl = await import(url.href);
  } catch (error) {
    trace("import failed: " + String((error && error.message) || error));
    throw error;
  }
  trace("import ok, keys=" + Object.keys(impl).join(","));
  try {
    impl.mount(ctx, config);
    trace("mount ok");
  } catch (error) {
    trace("mount threw: " + String((error && error.message) || error));
    throw error;
  }
}
