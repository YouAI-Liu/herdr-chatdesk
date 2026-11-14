// Sidebar tree, T3 Code style: space (project) > session (a tab's lead agent) > sub-agents.
// A sub-agent hangs under the terminal that started it: the core's `parent`, or the
// `herdr.parent=<address>` label for agents started with `hc run --no-parent`.
// A tab whose lead was started by a terminal in another tab nests under that session too.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, agents, terminals, panes, focused, run, hc, theme, setAgentOrder, openOverlay, layout, shared } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const top = (list) => list.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
const PILL = { working: "Working", blocked: "Needs input", done: "Done" };
const SHOW = 6; // sessions per space before "Show more"
// Fallback when a terminal reports no status: Claude Code spins its title while it
// works (◐◓◑◒) and shows ✳ when idle. Real reports always win.
function fromTitle(title) {
  const c = (title ?? "").trimStart()[0];
  if (!c) return null;
  if ("◐◓◑◒".includes(c) || (c >= "⠀" && c <= "⣿")) return "working";
  if (c === "✳" || c === "π") return "idle";
  return null;
}
// Programs whose status may only show in their title.
const SILENT = new Set(["claude", "codex", "pi"]);
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function ago(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  if (p.tint) return svg(p.icon).size(size).flex_none().text_color(color);
  // App icons (programs.json): a picture, with app-icon corners.
  return div().w(size).h(size).flex_none().rounded(Math.round(size * 0.24)).overflow_hidden().child(image(p.icon).w(size).h(size));
}

// The pane a tab is known by: its first agent, else its focused terminal, else its first.
function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const cur = leads.get(p.tab);
    if (!cur || (!cur.program?.agent && (p.program?.agent || (!cur.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

// A tab's name when someone gave it one, else what its agent calls itself.
function sessionTitle(tab, lead, term) {
  const prog = lead?.program?.name;
  const live = clean(lead?.title);
  const telling = live && live !== prog && live.toLowerCase() !== "chat" && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== lead?.program?.key && !/^([\w.-]+\/)?t\d[0-9a-z]*$/i.test(live);
  if (tab.named && tab.name !== prog && tab.name.toLowerCase() !== "chat") return tab.name;
  // A name given at start (`hc run --name`) says what it was started for.
  if (term?.name) return term.name;
  if (telling) return live;
  return term?.name || prog || (tab.name.toLowerCase() !== "chat" ? tab.name : "Session");
}

export default class SessionTree extends View {
  init(_props, cx) {
    this.folded = new Set(JSON.parse(localStorage.getItem("folded") ?? "[]"));
    this.more = new Set();
    // tab id -> { busy, at }: whether it was working, and when it last stopped.
    this.finished = JSON.parse(localStorage.getItem("finished") ?? "{}");
    this.hovered = null;
    this.seenStatus = {}; // tab id -> status at the last render
    // Tabs that stopped working unseen (title-only agents); kept across reloads.
    this.madeDone = new Set(JSON.parse(localStorage.getItem("madeDone") ?? "[]"));
    // Herdr hands mods the title without its spinner glyph; the core keeps it.
    // terminal -> status read from the raw title, for agents that report none.
    this.raw = {};
    this.asks = {}; // terminal -> { kind, msg } while it is blocked
    cx.timer.every(2500, (cx) => this.pollTitles(cx));
    this.pollTitles(cx);
    cx.timer.every(30000, (cx) => cx.notify()); // relative times
    // Each machine's connection (hc machine ls), for the dot on its header.
    this.links = {};
    this.refreshMachines(cx);
    cx.timer.every(15000, (cx) => this.refreshMachines(cx));
  }

  refreshMachines(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) {
          const links = {};
          for (const x of JSON.parse(r.stdout).machines ?? []) if (!x.temporary) links[x.name] = x.state;
          if (JSON.stringify(links) !== JSON.stringify(this.links)) { this.links = links; cx.notify(); }
        }
      } catch {}
    });
  }

  // This computer is always there; another machine by hc's word, else by its layout.
  linkOf(mach) {
    if (!mach) return "connected";
    const state = this.links[mach];
    if (state) return state;
    const layout = machines().find((x) => x.name === mach)?.layout;
    return layout === "unavailable" ? "unavailable" : "connected";
  }

  toggle(id, cx) {
    this.folded.has(id) ? this.folded.delete(id) : this.folded.add(id);
    localStorage.setItem("folded", JSON.stringify([...this.folded]));
    cx.notify();
  }

  // Everything the tree needs, read once per render.
  model() {
    const live = terminals().filter((t) => t.state === "live");
    const byAddr = new Map(live.map((t) => [t.address, t]));
    const byChat = new Map(live.filter((t) => t.labels?.["herdr.chat"]).map((t) => [t.labels["herdr.chat"], t]));
    const links = shared("chat.links") ?? {};
    const seen = shared("chat.seen") ?? {};
    this.codexPreSeen ??= new Set();
    const isCodexTerm = (t) => Boolean(
      t && (
        t.program?.key === "codex" ||
        t.report?.app === "codex" ||
        t.agent === "codex" ||
        (t.argv ?? []).some((a) => String(a).split("/").pop() === "codex") ||
        /\bcodex$/i.test(String(t.labels?.where ?? ""))
      )
    );
    for (const t of live) {
      if (isCodexTerm(t) && (t.turn ?? 0) <= 1 && Number(t.labels?.["herdr.seen"] ?? 0) < 1 && !this.codexPreSeen.has(t.address)) {
        this.codexPreSeen.add(t.address);
        hc(["label", t.address, "herdr.seen=1"]).catch(() => {});
      }
    }
    const isSeenTerm = (t, activeTab = false) => {
      if (activeTab) return true;
      if (!t) return false;
      const turn = t.turn ?? 0;
      const isCodexInit = isCodexTerm(t) && turn <= 1;
      return Boolean(isCodexInit || (seen[t.address] ?? -1) >= turn || Number(t.labels?.["herdr.seen"] ?? -1) >= turn);
    };
    const status = new Map(agents().map((a) => [a.address, a.status === "done" && isSeenTerm(byAddr.get(a.address), false) ? "idle" : a.status]));
    const ps = panes().map((p) => {
      if (p.terminal) {
        const t = byAddr.get(p.terminal);
        return p.status === "done" && isSeenTerm(t, false) ? { ...p, status: "idle" } : p;
      }
      if (p.mod !== "chat") return p;
      const t = byChat.get(p.pane) ?? byAddr.get(links[p.pane] ?? (p.tab ? links[`tab:${p.tab}`] : null) ?? p.props?.terminal);
      if (!t) return p;
      const st = typeof t.status === "string" ? t.status : t.status?.state;
      return {
        ...p,
        terminal: t.address,
        program: t.program,
        app: t.report?.app ?? null,
        title: t.title || p.title,
        cwd: t.cwd || p.cwd,
        status: st === "done" && (p.focused || isSeenTerm(t, false)) ? "idle" : st,
      };
    });
    const leads = leadPanes(ps);
    const tabOf = new Map(ps.filter((p) => p.terminal).map((p) => [p.terminal, p.tab]));
    const paneOf = new Map(ps.filter((p) => p.terminal).map((p) => [p.terminal, p]));
    const parentOf = (t) => {
      let p = t?.parent || t?.labels?.["herdr.parent"] || null;
      // A bare label names a terminal on the same machine as the child.
      if (p && !p.includes("/") && t.address.includes("/")) p = `${t.address.split("/")[0]}/${p}`;
      return p;
    };
    const kids = new Map();
    for (const t of live) {
      const p = parentOf(t);
      if (!p || p === t.address) continue;
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p).push(t);
    }
    // Tabs adopted by a terminal in another tab.
    const adopted = new Map(); // tab id -> parent address
    for (const [tab, lead] of leads) {
      const p = parentOf(byAddr.get(lead.terminal));
      if (p && tabOf.has(p) && tabOf.get(p) !== tab) adopted.set(tab, p);
    }
    return { live, byAddr, status, ps, leads, tabOf, paneOf, parentOf, kids, adopted, isSeenTerm };
  }

  termStatus(m, t) {
    let s = m.status.get(t.address) ?? (typeof t.status === "string" ? t.status : t.status?.state) ?? this.raw[t.address] ?? fromTitle(t.title);
    if (s === "done" && m.isSeenTerm?.(t, false)) s = "idle";
    if (!s && t.state === "live" && !t.program?.agent && !t.program?.shell && Date.now() - (t.created_ms ?? 0) > 10000) s = "working";
    return s === "error" ? "blocked" : s;
  }

  paneStatus(p) {
    return p.status ?? this.raw[p.terminal] ?? fromTitle(p.title);
  }

  // One pass over the core for what Herdr doesn't hand mods: the spinner in a
  // silent agent's title, and why a blocked agent waits (question or permission).
  pollTitles(cx) {
    if (this.polling) return;
    const ps = panes();
    const live = terminals().filter((t) => t.state === "live");
    const silent = [...new Set([
      ...ps.filter((p) => p.terminal && !p.status && SILENT.has(p.program?.key)).map((p) => p.terminal),
      ...live.filter((t) => !t.status && (SILENT.has(t.program?.key) || t.parent || t.labels?.["herdr.parent"])).map((t) => t.address),
    ])];
    const blocked = [...new Set([
      ...ps.filter((p) => p.terminal && p.status === "blocked").map((p) => p.terminal),
      ...live.filter((t) => t.status === "blocked" || t.status === "error").map((t) => t.address),
    ])];
    const targets = [...new Set([...silent, ...blocked])];
    if (!targets.length && !Object.keys(this.raw).length && !Object.keys(this.asks).length) return;
    this.polling = true;
    cx.spawn(async (cx) => {
      let dirty = false;
      const raw = {}, asks = {};
      for (const addr of targets) {
        try {
          const r = await hc(["get", addr, "--json"]);
          if (r.code !== 0) continue;
          const d = JSON.parse(r.stdout);
          if (silent.includes(addr)) raw[addr] = fromTitle(d.title);
          const st = d.status;
          if (st && typeof st === "object" && st.state === "blocked") asks[addr] = { kind: st.kind ?? null, msg: st.msg ?? null };
          else if (!st && raw[addr] === undefined) raw[addr] = fromTitle(d.title);
        } catch {}
      }
      if (JSON.stringify(raw) !== JSON.stringify(this.raw) || JSON.stringify(asks) !== JSON.stringify(this.asks)) dirty = true;
      this.raw = raw;
      this.asks = asks;
      this.polling = false;
      if (dirty) cx.notify();
    });
  }

  // A tab's status from its panes, with done made up for title-only agents: it
  // stopped working while you weren't looking at it.
  tabStatus(m, tab) {
    const mine = m.ps.filter((p) => p.tab === tab.id && p.terminal);
    const seenTab = this.focusedTab === tab.id || (mine.length > 0 && mine.every((p) => m.isSeenTerm?.(m.byAddr.get(p.terminal), false)));
    const reported = tab.status === "done" && seenTab ? "idle" : tab.status;
    let s = top([reported, ...mine.map((p) => this.paneStatus(p))]);
    if (s === "done" && seenTab) s = "idle";
    const prev = this.seenStatus[tab.id];
    this.seenStatus[tab.id] = s;
    const had = this.madeDone.has(tab.id);
    if (seenTab || s === "working" || s === "blocked") this.madeDone.delete(tab.id);
    else if (prev === "working" && s === "idle") this.madeDone.add(tab.id);
    if (had !== this.madeDone.has(tab.id)) localStorage.setItem("madeDone", JSON.stringify([...this.madeDone]));
    if (this.madeDone.has(tab.id) && (s === "idle" || !s)) s = "done";
    return s;
  }

  // Children of a terminal: its paneless sub-agents, and tabs it started.
  childrenOf(m, addr, tabsById, seen) {
    if (seen.has(addr)) return [];
    seen.add(addr);
    const out = [];
    for (const k of m.kids.get(addr) ?? []) {
      if (m.paneOf.has(k.address)) continue; // shown as a pane of its own tab
      out.push({ kind: "sub", id: k.address, term: k, status: this.termStatus(m, k), ask: this.askOf(m, k.address), kids: this.childrenOf(m, k.address, tabsById, seen) });
    }
    for (const [tab, p] of m.adopted) if (p === addr && tabsById.has(tab)) out.push(this.session(m, tabsById.get(tab), tabsById, seen, true));
    return out;
  }

  // A tab as a session: its lead, plus every other agent pane and every started terminal.
  session(m, { tab, space }, tabsById, seen, nested = false) {
    const lead = m.leads.get(tab.id);
    const term = lead && m.byAddr.get(lead.terminal);
    const kids = [];
    if (lead) kids.push(...this.childrenOf(m, lead.terminal, tabsById, seen));
    for (const p of m.ps) {
      if (p.tab !== tab.id || !p.terminal || p.terminal === lead?.terminal) continue;
      if (p.program?.agent) {
        const t = m.byAddr.get(p.terminal);
        kids.push({ kind: "pane", id: p.terminal, pane: p, term: t, status: this.paneStatus(p) ?? "idle", ask: this.askOf(m, p.terminal), kids: this.childrenOf(m, p.terminal, tabsById, seen) });
      } else kids.push(...this.childrenOf(m, p.terminal, tabsById, seen));
    }
    return { kind: "session", id: tab.id, tab, space, lead, term, nested, status: this.tabStatus(m, tab), ask: this.askOf(m, lead?.terminal), kids };
  }

  rollup(n) {
    return top([n.status, ...n.kids.map((k) => this.rollup(k))]);
  }

  // ---- drawing ----

  // `ask`: why a blocked agent waits ({ kind: "question" | "permission", msg }).
  pill(t, s, small = false, ask = null, id = null) {
    if (!PILL[s]) return null;
    const c = t[s] ?? t.dim;
    const label = s !== "blocked" ? PILL[s]
      : ask?.kind === "question" ? "Question"
      : ask?.kind === "permission" ? "Approval"
      : small ? "Input" : PILL[s];
    return h_flex().flex_none().h(small ? 16 : 18).px(small ? 5 : 6).gap(small ? 4 : 5).rounded(9).items_center().bg(c + "1f")
      .text_size(small ? 9.8 : 10.5).font_medium().text_color(c)
      .when(Boolean(id && ask?.msg), (el) => el.id(`pill-${id}`).tooltip(ask.msg))
      .child(div().size(small ? 5 : 6).rounded(3).bg(c).when(s === "working", (el) => el.loop("opacity", { from: 0.3, to: 1, period: 1100 })))
      .child(label);
  }

  // A sub-agent's state, beside its name: a small pill, or a ring when idle.
  subMark(t, s, ask, id) {
    return this.pill(t, s, true, ask, id) ?? div().size(7).mx(4).flex_none().rounded(4).border(1.2).border_color(t.idle ?? t.dim);
  }

  // Why the most urgent blocked agent in a subtree waits.
  rollupAsk(n) {
    if (n.status === "blocked" && n.ask) return n.ask;
    for (const k of n.kids) { const a = this.rollupAsk(k); if (a) return a; }
    return null;
  }

  askOf(m, addr) {
    if (!addr) return null;
    const r = m.byAddr.get(addr)?.report;
    if (r?.state === "blocked" && (r.kind || r.msg)) return { kind: r.kind, msg: r.msg };
    return this.asks[addr] ?? null;
  }

  dot(t, s) {
    if (s === "working") return svg("mods/workspace-chrome/spinner.svg").size(11).flex_none().text_color(t.working).spin(900);
    if (s === "blocked" || s === "done") return div().size(7).mx(2).flex_none().rounded(4).bg(t[s]);
    return div().size(7).mx(2).flex_none().rounded(4).border(1.2).border_color(t.idle ?? t.dim);
  }

  chevron(t, open, id, cx_toggle) {
    return div().id(`fold-${id}`).size(16).flex_none().flex().items_center().justify_center().rounded(4)
      .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); cx_toggle(cx); })
      .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11));
  }

  spaceRow(t, s, sessions, cx0) {
    const open = !this.folded.has(s.id);
    const hov = this.hovered === `sp-${s.id}`;
    const urgent = top(sessions.map((x) => this.rollup(x)));
    return h_flex().id(`sp-${s.id}`).h(30).pl(4).pr(6).mt(2).flex_none().gap(6).items_center().rounded(7)
      .cursor_pointer()
      .hover((el) => el.bg(t.hover))
      .on_hover((on, cx) => { this.hovered = on ? `sp-${s.id}` : this.hovered === `sp-${s.id}` ? null : this.hovered; cx.notify(); })
      .on_click((_e, cx) => {
        if (!s.active) run("space.select", { id: s.id });
        else this.toggle(s.id, cx);
        if (!open && !s.active) this.toggle(s.id, cx);
      })
      .on_mouse_down("right", () => openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } }))
      .child(this.chevron(t, open, s.id, (cx) => this.toggle(s.id, cx)))
      .child(svg("mods/workspace-chrome/folder.svg").size(15).flex_none().text_color(s.active ? t.foreground : t.muted))
      .child(div().flex_1().min_w(0).truncate().font_medium().text_color(s.active ? t.foreground : t.muted).child(s.name))
      .when(hov, (el) => el.child(div().id(`new-${s.id}`).size(20).flex_none().flex().items_center().justify_center().rounded(5)
        .text_color(t.dim).hover((x) => x.bg(t.raised).text_color(t.foreground)).tooltip("New session")
        .on_click((_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "session-new", kind: "popup", width: 250, height: 300, props: { space: s.id } }); })
        .child(svg("mods/workspace-chrome/plus.svg").size(13))))
      .when(!hov && !open && sessions.length > 0, (el) => el
        .when(Boolean(PILL[urgent]), (el) => el.child(this.pill(t, urgent, true, sessions.map((x) => this.rollupAsk(x)).find(Boolean), `sp-${s.id}`)))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(String(sessions.length))));
  }

  // Tree lines in front of a nested row: one column per level.
  lines(t, lead) {
    return lead.map((l) => div().self_start().mt(-5).w(11).h(18).mr(3).flex_none()
      .when(Boolean(l), (el) => el.border_l(1.2).border_color(t.input))
      .when(l === "└" || l === "├", (el) => el.border_b(1.2).rounded_bl(6)));
  }

  rows(t, n, depth, lead, out, order, ctx) {
    const kidsOpen = !this.folded.has(`n-${n.id}`);
    const now = Date.now();
    if (n.kind === "session") {
      const on = ctx.focusedTab === n.tab.id;
      const name = sessionTitle(n.tab, n.lead, n.term);
      const pic = icon(n.lead?.program, 14, t.foreground);
      const when = n.tab.changed_at;
      const roll = this.rollup(n);
      if (n.lead?.terminal && n.lead?.program?.agent) order.push(n.lead.terminal);
      const top0 = depth === 0;
      out.push(h_flex().id(`se-${n.id}`).h(top0 ? 28 : 24).pl(top0 ? 26 : 26).pr(6).flex_none().gap(0).items_center().rounded(7)
        .cursor_pointer()
        .when(on, (el) => el.bg(t.selected))
        .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click(() => (n.lead ? run("pane.focus", { pane: n.lead.pane }) : run("tab.select", { id: n.tab.id })))
        .on_mouse_down("right", () => openOverlay({ mod: "menu", kind: "popup", width: 200, height: 160, props: { tab: "tab", target: { id: n.tab.id, space: n.space.id } } }))
        .children(this.lines(t, lead))
        .when(Boolean(pic), (el) => el.child(div().mr(8).child(pic)))
        .when(!pic, (el) => el.child(div().size(6).mx(4).mr(8).rounded(3).bg(t.dim)))
        .child(div().flex_1().min_w(0).truncate().text_size(top0 ? 12.8 : 12.3)
          .text_color(on || n.status === "blocked" || n.status === "working" ? t.foreground : t.muted).child(name))
        .when(n.kids.length > 0, (el) => el.child(div().ml(4).child(this.chevron(t, kidsOpen, `n-${n.id}`, (cx) => this.toggle(`n-${n.id}`, cx)))))
        .when(n.kids.length > 0 && !kidsOpen, (el) => el.child(div().mr(4).text_size(10.5).text_color(t.dim).child(String(n.kids.length))))
        .child(h_flex().flex_none().gap(6).ml(4).items_center()
          .when(Boolean(PILL[kidsOpen ? n.status : roll]), (el) => el.child(this.pill(t, kidsOpen ? n.status : roll, false, kidsOpen ? n.ask : this.rollupAsk(n), n.id)))
          .when(Boolean(when), (el) => el.child(div().w(24).text_right().text_size(10.5).text_color(t.dim).child(ago(now - when))))));
    } else {
      const k = n.term;
      const on = ctx.focusedTerm === k?.address;
      const pic = icon(k?.program, 12, t.foreground);
      if (k) order.push(k.address);
      out.push(h_flex().id(`sub-${n.id}`).h(24).pl(26).pr(6).flex_none().items_center().rounded(7)
        .cursor_pointer()
        .when(on, (el) => el.bg(t.selected))
        .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click(() => (n.kind === "pane" ? run("pane.focus", { pane: n.pane.pane }) : run("terminal.peek", { terminal: k.address })))
        .children(this.lines(t, lead))
        .when(Boolean(pic), (el) => el.child(div().mr(7).child(pic)))
        .child(div().flex_1().min_w(0).truncate().text_size(12.3).text_color(on ? t.foreground : t.muted)
          .child(k?.name || k?.template || k?.program?.name || n.id))
        .when(n.kids.length > 0, (el) => el.child(this.chevron(t, kidsOpen, `n-${n.id}`, (cx) => this.toggle(`n-${n.id}`, cx))))
        .child(div().ml(6).child(this.subMark(t, kidsOpen ? n.status : this.rollup(n), kidsOpen ? n.ask : this.rollupAsk(n), n.id))));
    }
    if (!kidsOpen) return;
    n.kids.forEach((k, i) => {
      const last = i === n.kids.length - 1;
      const childLead = [...lead.map((l) => (l === "└" ? "" : l === "├" ? "│" : l)), last ? "└" : "├"];
      this.rows(t, k, depth + 1, childLead, out, order, ctx);
    });
  }

  render(cx) {
    const t = theme();
    const sp = spaces();

    const m = this.model();
    const tabsById = new Map(sp.flatMap((s) => s.tabs.map((tab) => [tab.id, { tab, space: s }])));
    const f = focused();
    const activeTabId = sp.find((s) => s.active)?.tabs?.find((tab) => tab.active)?.id ?? f?.tab;
    const ctx = { focusedTab: activeTabId, focusedTerm: f?.terminal ?? f?.agent };
    this.focusedTab = activeTabId;
    const order = [];
    const collapsed = narrow();

    const seen = new Set();
    const perSpace = sp.map((s) => ({
      s,
      sessions: s.tabs.filter((tab) => !m.adopted.has(tab.id)).map((tab) => this.session(m, { tab, space: s }, tabsById, seen)),
    }));

    // Order: sessions waiting on you, then working ones, then the rest; within each,
    // the latest change first.
    const now = Date.now();
    let dirty = false;
    for (const { sessions } of perSpace) {
      for (const n of sessions) {
        const s = this.rollup(n);
        // 2: waiting on you, 1: working, 0: the rest. Higher sorts first.
        const busy = s === "blocked" ? 2 : s === "working" ? 1 : 0;
        const prev = this.finished[n.id];
        if (!prev) { this.finished[n.id] = { busy, at: n.tab.changed_at ?? 0 }; dirty = true; }
        else if (prev.busy !== busy) { this.finished[n.id] = { busy, at: now }; dirty = true; }
      }
      sessions.sort((a, b) => {
        const fa = this.finished[a.id], fb = this.finished[b.id];
        return (Number(fb.busy) - Number(fa.busy)) || (fb.at - fa.at) || (a.tab.index - b.tab.index);
      });
    }
    if (dirty) {
      const live = new Set(tabsById.keys());
      for (const id of Object.keys(this.finished)) if (!live.has(id)) delete this.finished[id];
      localStorage.setItem("finished", JSON.stringify(this.finished));
    }

    // Every known machine keeps its header, spaces or not; other machines (a server)
    // above this computer.
    const machinesShown = [...new Set([null, ...machines().map((x) => x.name ?? null), ...sp.map((s) => s.machine ?? null)])]
      .sort((a, b) => (a === null) - (b === null) || String(a).localeCompare(String(b)));
    // New space on that machine: the folder dialog (space-new), always told which machine,
    // since Herdr's own new-space follows the focused space's machine.
    const newSpace = (mach) => openOverlay({ mod: "space-new", kind: "dialog", width: 640, height: 560, props: { machine: mach ?? "" } });
    const out = [];
    for (const mach of machinesShown) {
      const mine = perSpace.filter((x) => (x.s.machine ?? null) === mach);
      if (!collapsed) {
        const mid = `m-${mach ?? "local"}`;
        const open = !this.folded.has(mid);
        const machUrgent = top(mine.flatMap((x) => x.sessions.map((n) => this.rollup(n))));
        const hov = this.hovered === mid;
        const link = this.linkOf(mach);
        out.push(h_flex().id(mid).h(24).mt(6).px(8).flex_none().gap(6).items_center().text_size(11).text_color(t.dim)
          .cursor_pointer().hover((el) => el.text_color(t.foreground))
          .on_hover((on, cx) => { this.hovered = on ? mid : this.hovered === mid ? null : this.hovered; cx.notify(); })
          .on_click((_e, cx) => this.toggle(mid, cx))
          .child(svg(`mods/workspace-chrome/${mach ? "server" : "monitor"}.svg`).size(12).flex_none())
          .child(div().flex_1().truncate().child(mach ?? "This computer"))
          .when(hov, (el) => el.child(div().id(`${mid}-new`).size(18).flex_none().flex().items_center().justify_center().rounded(4)
            .hover((x) => x.bg(t.hover).text_color(t.foreground)).tooltip("New space")
            .on_click((_e, cx) => { cx.stop_propagation(); newSpace(mach); })
            .child(svg("mods/workspace-chrome/plus.svg").size(12))))
          .when(!open && Boolean(PILL[machUrgent]), (el) => el.child(this.pill(t, machUrgent, true)))
          .when(link !== "connected", (el) => el.child(div().flex_none().text_size(10.5).child(link.replace(/_/g, " "))))
          .child(div().id(`${mid}-link`).size(6).rounded(3).flex_none().bg(link === "connected" ? t.ansi2 : t.dim)
            .tooltip(link === "connected" ? "Online" : `Offline · ${link.replace(/_/g, " ")}`))
          .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(10).flex_none()));
        if (!open) continue;
        if (!mine.length) {
          out.push(h_flex().id(`${mid}-empty`).h(26).pl(26).pr(8).flex_none().gap(6).items_center().rounded(7)
            .text_size(12).text_color(t.dim).cursor_pointer().hover((el) => el.bg(t.hover).text_color(t.foreground))
            .on_click(() => newSpace(mach))
            .child(div().child("No spaces ·"))
            .child(svg("mods/workspace-chrome/plus.svg").size(11).flex_none())
            .child(div().child("New space")));
          continue;
        }
      }
      for (const { s, sessions } of mine) {
        if (collapsed) {
          out.push(h_flex().id(`sp-${s.id}`).h(26).flex_none().justify_center().gap(4)
            .when(s.active, (el) => el.bg(t.raised)).hover((el) => el.bg(t.hover))
            .on_click(() => run("space.select", { id: s.id }))
            .child(div().text_color(s.active ? t.foreground : t.muted).child(String(s.index)))
            .child(this.dot(t, top(sessions.map((x) => this.rollup(x))))));
          continue;
        }
        out.push(this.spaceRow(t, s, sessions, cx));
        if (this.folded.has(s.id)) continue;
        if (!sessions.length) {
          out.push(div().id(`empty-${s.id}`).h(24).pl(48).flex_none().flex().items_center().text_size(12).text_color(t.dim).child("No sessions yet"));
          continue;
        }
        const all = this.more.has(s.id);
        const shown = all ? sessions : sessions.slice(0, SHOW);
        for (const n of shown) this.rows(t, n, 0, [], out, order, ctx);
        if (sessions.length > SHOW) {
          out.push(div().id(`more-${s.id}`).h(22).pl(48).flex_none().flex().items_center().text_size(11.5).text_color(t.dim)
            .cursor_pointer().hover((el) => el.text_color(t.foreground))
            .on_click((_e, cx) => { all ? this.more.delete(s.id) : this.more.add(s.id); cx.notify(); })
            .child(all ? "Show less" : `Show ${sessions.length - SHOW} more`));
        }
      }
    }
    setAgentOrder(order);

    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).flex_none().items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(!collapsed, (el) => el.child("Spaces")))
      .child(v_flex().id("tree").flex_1().min_h(0).px(collapsed ? 0 : 8).pb(14).overflow_y_scrollbar().mode("always").children(out));
  }
}
