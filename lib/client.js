/* mcii-jiejia（解甲）client half — 一个开关，一个清理按钮。
 *
 * 只注册两处：
 *   1. sidebar.panellist — 侧栏图标（SVG）
 *   2. main              — 面板页
 * 刻意不注册 conversation.input.dock：会话输入框不出现任何徽标/状态条。
 */
window.__ModuleLoader__.load({
  id: "mcii-jiejia",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");

    var inject = ["slots"];

    var PANEL_ID = "armor-one";
    // 路由前缀：新版本走 v5（热重载后旧实例没占过这个前缀），失败回落 v1
    var PREFIXES = ["/armor-one/v6", "/armor-one/v5", "/armor-one"];
    function apiFor(prefix) {
      return { state: prefix + "/state", mode: prefix + "/mode", off: prefix + "/off" };
    }
    var API = apiFor(PREFIXES[0]);
    var PANEL_LABEL = "解甲";
    var VERSION = "1.1.0";
    var POLL_MS = 3000;

    // ---- 图标（纯 SVG，24 网格，currentColor 描边）----
    function svg(size, children, extraProps) {
      var props = {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.75,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
        focusable: "false",
      };
      if (extraProps) for (var k in extraProps) props[k] = extraProps[k];
      return react.createElement.apply(null, ["svg", props].concat(children));
    }

    // 解甲标记：盾形 + 穿透的尖
    function IconMark(size) {
      return svg(size || 18, [
        react.createElement("path", { key: "shield", d: "M12 2.6 4.9 5.4v6.1c0 4.4 2.8 8 7.1 9.9 4.3-1.9 7.1-5.5 7.1-9.9V5.4L12 2.6Z" }),
        react.createElement("path", { key: "crack", d: "M12 5.6v6.2l-2.4 2.3 2.4 2.4v2.1" }),
      ]);
    }

    // 侧栏图标（更细的盾 + 斜切）
    function IconSidebar() {
      return svg(18, [
        react.createElement("path", { key: "s", d: "M12 3.2 5.6 5.8v5.6c0 4.1 2.6 7.5 6.4 9.2 3.8-1.7 6.4-5.1 6.4-9.2V5.8L12 3.2Z" }),
        react.createElement("path", { key: "d", d: "M9.1 9.4h5.8M9.1 12.4h4M9.1 15.4h5.8", strokeWidth: 1.5 }),
      ]);
    }

    function IconGlobe() {
      return svg(15, [
        react.createElement("circle", { key: "c", cx: 12, cy: 12, r: 8.4 }),
        react.createElement("path", { key: "a", d: "M3.6 12h16.8" }),
        react.createElement("path", { key: "b", d: "M12 3.6c2.2 2.3 3.4 5.3 3.4 8.4s-1.2 6.1-3.4 8.4c-2.2-2.3-3.4-5.3-3.4-8.4S9.8 5.9 12 3.6Z" }),
      ]);
    }

    function IconMask() {
      return svg(15, [
        react.createElement("path", { key: "p", d: "M3 3.6 21 20.4" }),
        react.createElement("path", { key: "e", d: "M10.6 6.2A9.6 9.6 0 0 1 12 6.1c4.6 0 8 3.6 9 5.9-.5 1.2-1.5 2.7-2.9 3.9" }),
        react.createElement("path", { key: "f", d: "M6.6 8.3C5 9.6 3.9 11 3 12c1 2.3 4.4 5.9 9 5.9 1.4 0 2.7-.3 3.8-.9" }),
        react.createElement("path", { key: "g", d: "M9.9 10.2a3 3 0 0 0 4.1 4.2" }),
      ]);
    }

    function IconRuntime() {
      return svg(15, [
        react.createElement("path", { key: "a", d: "M4 7.2h16" }),
        react.createElement("path", { key: "b", d: "M4 12h11" }),
        react.createElement("path", { key: "c", d: "M4 16.8h7" }),
        react.createElement("path", { key: "d", d: "M18.6 12.4 20.4 14l-4.2 4.2h-1.8v-1.8L18.6 12.4Z" }),
      ]);
    }

    function IconTrash() {
      return svg(15, [
        react.createElement("path", { key: "a", d: "M4.2 6.6h15.6" }),
        react.createElement("path", { key: "b", d: "M9.4 6.6V4.8c0-.7.6-1.2 1.2-1.2h2.8c.6 0 1.2.5 1.2 1.2v1.8" }),
        react.createElement("path", { key: "c", d: "M6.6 6.6 7.4 19c.1.9.8 1.5 1.7 1.5h5.8c.9 0 1.6-.6 1.7-1.5l.8-12.4" }),
        react.createElement("path", { key: "d", d: "M10.6 10.6v6M13.4 10.6v6", strokeWidth: 1.4 }),
      ]);
    }

    function IconCheck() {
      return svg(13, [react.createElement("path", { key: "p", d: "M4.6 12.6 9.4 17.2 19.4 6.8" })]);
    }

    function IconDot() {
      return svg(13, [react.createElement("circle", { key: "c", cx: 12, cy: 12, r: 4, fill: "currentColor", stroke: "none" })]);
    }

    var CSS =
      ".a1{display:flex;flex-direction:column;gap:16px;padding:22px;box-sizing:border-box;width:100%;height:100%;overflow-y:auto;font-size:13px;line-height:1.55;color:inherit}" +
      ".a1 *{box-sizing:border-box}" +
      ".a1-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}" +
      ".a1-brand{display:flex;align-items:center;gap:11px;min-width:0}" +
      ".a1-mark{width:34px;height:34px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex:none;color:#22c55e;background:linear-gradient(140deg,rgba(34,197,94,.26),rgba(34,197,94,.05));border:1px solid rgba(34,197,94,.34);box-shadow:0 0 0 1px rgba(0,0,0,.02) inset}" +
      ".a1-mark.off{color:#9ca3af;background:linear-gradient(140deg,rgba(148,163,184,.18),rgba(148,163,184,.04));border-color:rgba(148,163,184,.28)}" +
      ".a1-name{font-size:15px;font-weight:650;letter-spacing:.01em}" +
      ".a1-sub{font-size:11px;opacity:.45;font-variant-numeric:tabular-nums;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".a1-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap;font-variant-numeric:tabular-nums}" +
      ".a1-on{background:rgba(34,197,94,.14);color:#22c55e}" +
      ".a1-off{background:rgba(128,128,128,.14);color:inherit;opacity:.7}" +
      ".a1-card{border:1px solid rgba(128,128,128,.2);border-radius:14px;padding:16px 18px;background:rgba(128,128,128,.045)}" +
      ".a1-switchRow{display:flex;align-items:center;gap:14px}" +
      ".a1-switchText{flex:1 1 auto;min-width:0}" +
      ".a1-switchTitle{font-size:13.5px;font-weight:600}" +
      ".a1-switchDesc{font-size:12px;opacity:.55;margin-top:3px;line-height:1.5}" +
      ".a1-sw{width:46px;height:26px;border-radius:999px;border:1px solid rgba(128,128,128,.35);background:rgba(128,128,128,.22);position:relative;cursor:pointer;flex:none;transition:background .18s,border-color .18s;padding:0;-webkit-appearance:none;appearance:none}" +
      ".a1-sw::after{content:'';position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;opacity:.94;transition:transform .18s;box-shadow:0 1px 3px rgba(0,0,0,.28)}" +
      ".a1-sw.on{background:#22c55e;border-color:#22c55e}" +
      ".a1-sw.on::after{transform:translateX(20px)}" +
      ".a1-sw:disabled{opacity:.45;cursor:wait}" +
      ".a1-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}" +
      ".a1-metric{border:1px solid rgba(128,128,128,.16);border-radius:11px;padding:11px 13px;background:rgba(128,128,128,.03);display:flex;flex-direction:column;gap:2px}" +
      ".a1-metricK{display:flex;align-items:center;gap:5px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;opacity:.45}" +
      ".a1-metricV{font-size:15px;font-weight:600;margin-top:3px;font-variant-numeric:tabular-nums}" +
      ".a1-actions{display:flex;gap:9px;flex-wrap:wrap}" +
      ".a1-btn{display:inline-flex;align-items:center;gap:7px;-webkit-appearance:none;appearance:none;font-family:inherit;font-size:12.5px;font-weight:600;border-radius:9px;padding:8px 15px;cursor:pointer;border:1px solid rgba(128,128,128,.28);background:rgba(128,128,128,.08);color:inherit;transition:background .15s}" +
      ".a1-btn:hover{background:rgba(128,128,128,.14)}" +
      ".a1-btn:active{transform:scale(.985)}" +
      ".a1-btn:disabled{opacity:.5;cursor:wait}" +
      ".a1-btnDanger{color:#ef4444;border-color:rgba(239,68,68,.32);background:rgba(239,68,68,.09)}" +
      ".a1-btnDanger:hover{background:rgba(239,68,68,.15)}" +
      ".a1-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}" +
      ".a1-chip{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;padding:2px 7px;border-radius:5px;background:rgba(239,68,68,.1);color:#f87171}" +
      ".a1-note{font-size:11.5px;opacity:.5;line-height:1.6;margin-top:2px}" +
      ".a1-err{margin-top:2px;font-size:12px;padding:8px 11px;border-radius:9px;background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.25)}";

    var styleDone = false;
    function ensureStyle() {
      if (styleDone) return;
      if (typeof document === "undefined" || !document.head) return;
      if (!document.getElementById("mcii-jiejia-css")) {
        var el = document.createElement("style");
        el.id = "mcii-jiejia-css";
        el.textContent = CSS;
        document.head.appendChild(el);
      }
      styleDone = true;
    }

    function request(method, path, body, done) {
      try {
        fetch(path, {
          method: method,
          headers: { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
          .then(
            function (res) {
              return res.json().then(
                function (data) {
                  done({ ok: res.ok, status: res.status, data: data });
                },
                function () {
                  done({ ok: res.ok, status: res.status, data: null });
                },
              );
            },
            function (error) {
              done({ ok: false, status: 0, data: null, error: String((error && error.message) || error) });
            },
          );
      } catch (error) {
        done({ ok: false, status: 0, data: null, error: String((error && error.message) || error) });
      }
    }

    function Panel(props) {
      ensureStyle();

      var s = react.useState(null);
      var state = s[0];
      var setState = s[1];
      var b = react.useState(false);
      var busy = b[0];
      var setBusy = b[1];
      var e = react.useState("");
      var error = e[0];
      var setError = e[1];

      react.useEffect(function () {
        var alive = true;
        function load() {
          request("GET", API.state, undefined, function (res) {
            if (!alive) return;
            if (res.data && res.data.ok) {
              setState(res.data);
              setError("");
            } else if (res.status === 404) {
              // 旧实例可能永久占着更早的前缀：一路往回落，直到有一个前缀归当前这代代码所有
              var index = PREFIXES.indexOf(API.state.slice(0, API.state.lastIndexOf("/")));
              var nextPrefix = PREFIXES[index + 1];
              if (!nextPrefix) {
                setError("面板连不上后端（所有前缀都 404）—— 宿主需要重启一次");
                return;
              }
              API = apiFor(nextPrefix);
            } else if (res.status === 0) {
              setError("面板连不上后端（/armor-one/state 无响应）—— 宿主可能需要重启一次");
            }
          });
        }
        load();
        var timer = setInterval(load, POLL_MS);
        return function () {
          alive = false;
          clearInterval(timer);
        };
      }, []);

      function toggle() {
        if (busy || !state) return;
        // 开关的「开」= 正在注入。清理后 paused 且 allModes 仍是 true，所以要按有效状态取反，
        // 否则清理后点开关只会把 allModes 变成 false，注入依然停着。
        var next = !(state.allModes && !state.paused);
        setBusy(true);
        request("POST", API.mode, { allModes: next }, function (res) {
          setBusy(false);
          if (res.data && res.data.ok) {
            setState(res.data);
            setError("");
          } else {
            setError("切换失败：" + ((res.data && res.data.error) || res.error || "HTTP " + res.status));
          }
        });
      }

      function cleanup() {
        if (busy) return;
        setBusy(true);
        request("POST", API.off, {}, function (res) {
          setBusy(false);
          if (res.data && res.data.ok) {
            setState(res.data);
            setError("");
          } else {
            setError("清理失败：" + ((res.data && res.data.error) || res.error || "HTTP " + res.status));
          }
        });
      }

      var allModes = state ? state.allModes : true;
      var injected = state ? Boolean(state.injected) : false;
      var covered = state && Array.isArray(state.covered) ? state.covered : [];
      var paused = state ? Boolean(state.paused) : false;

      var statusText = state === null ? "读取中" : injected ? "已注入" : paused ? "已停止" : "未注入";
      var statusIcon = injected ? IconCheck() : IconDot();

      return react.createElement(
        "div",
        { className: "a1" },

        react.createElement(
          "div",
          { className: "a1-head" },
          react.createElement(
            "div",
            { className: "a1-brand" },
            react.createElement("span", { className: "a1-mark" + (injected ? "" : " off") }, IconMark(20)),
            react.createElement(
              "div",
              { style: { minWidth: 0 } },
              react.createElement("div", { className: "a1-name" }, PANEL_LABEL),
              react.createElement(
                "div",
                { className: "a1-sub" },
                "v" + VERSION + (state ? " · " + (state.promptChars || 0) + " 字" : ""),
              ),
            ),
          ),
          react.createElement("span", { className: "a1-pill " + (injected ? "a1-on" : "a1-off") }, statusIcon, statusText),
        ),

        react.createElement(
          "div",
          { className: "a1-card" },
          react.createElement(
            "div",
            { className: "a1-switchRow" },
            react.createElement(
              "div",
              { className: "a1-switchText" },
              react.createElement("div", { className: "a1-switchTitle" }, "全模式注入"),
              react.createElement(
                "div",
                { className: "a1-switchDesc" },
                allModes && !paused ? "所有会话、所有预设都套用解甲提示。" : paused ? "注入已清理，打开开关即恢复。" : "仅在选用「解甲模式」预设的会话里生效。",
              ),
            ),
            react.createElement("button", {
              className: "a1-sw" + (allModes && !paused ? " on" : ""),
              type: "button",
              role: "switch",
              "aria-checked": allModes && !paused ? "true" : "false",
              "aria-label": "全模式注入",
              disabled: busy || state === null,
              onClick: toggle,
            }),
          ),
        ),

        react.createElement(
          "div",
          { className: "a1-grid" },
          react.createElement(
            "div",
            { className: "a1-metric" },
            react.createElement("div", { className: "a1-metricK" }, IconGlobe(), "注入范围"),
            react.createElement("div", { className: "a1-metricV" }, paused ? "已停止" : allModes ? "全部" : "预设"),
          ),
          react.createElement(
            "div",
            { className: "a1-metric" },
            react.createElement("div", { className: "a1-metricK" }, IconMask(), "遮蔽段落"),
            react.createElement("div", { className: "a1-metricV" }, covered.length + " 段"),
          ),
          react.createElement(
            "div",
            { className: "a1-metric" },
            react.createElement("div", { className: "a1-metricK" }, IconRuntime(), "上下文"),
            react.createElement("div", { className: "a1-metricV" }, state && state.suppressed ? "已清空" : "保留"),
          ),
        ),

        covered.length > 0
          ? react.createElement(
              "div",
              { className: "a1-card" },
              react.createElement("div", { className: "a1-metricK" }, "已遮蔽的宿主段落"),
              react.createElement(
                "div",
                { className: "a1-list" },
                covered.map(function (n) {
                  return react.createElement("span", { key: n, className: "a1-chip" }, n);
                }),
              ),
              react.createElement("div", { className: "a1-note" }, "这些段落在提示词里已被置空；卸载插件即自动还原。"),
            )
          : null,

        react.createElement(
          "div",
          { className: "a1-actions" },
          react.createElement(
            "button",
            { className: "a1-btn a1-btnDanger", type: "button", disabled: busy, onClick: cleanup },
            IconTrash(),
            "清理注入",
          ),
        ),
        react.createElement(
          "div",
          { className: "a1-note" },
          "清理注入会立刻还原被遮蔽的宿主段落、撤掉解甲段落，并保持停止状态（重启也不会自己回来）；重新打开上面的开关即恢复注入。",
        ),

        error ? react.createElement("div", { className: "a1-err" }, error) : null,
        state && state.errors && state.errors.length > 0
          ? react.createElement("div", { className: "a1-err" }, "后端报告：" + state.errors.join(" · "))
          : null,
      );
    }

    function SidebarIcon() {
      return react.createElement(
        "span",
        { style: { display: "flex", alignItems: "center", justifyContent: "center", width: "18px", height: "18px" } },
        IconSidebar(),
      );
    }

    function apply(ctx) {
      function diag(label, err) {
        try {
          window.__dshArmorOneDiag = window.__dshArmorOneDiag || [];
          window.__dshArmorOneDiag.push({ label: label, message: String((err && err.message) || err) });
        } catch {
          // 非浏览器环境
        }
      }

      try {
        ctx.slots.inject("main", function () {
          return ctx.slots.register({ name: "main", key: PANEL_ID, label: PANEL_LABEL }, Panel);
        });
      } catch (error) {
        diag("main-register", error);
      }

      try {
        ctx.slots.inject("sidebar.panellist", function () {
          return ctx.slots.register({ name: "sidebar.panellist", id: PANEL_ID, order: 5, label: PANEL_LABEL }, SidebarIcon);
        });
      } catch (error) {
        diag("sidebar-register", error);
      }
    }

    exports.name = "mcii-jiejia";
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});