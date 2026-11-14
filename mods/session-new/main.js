// "+" on a space: pick an agent installed on that space's machine and start it there,
// or open a plain terminal. Props: { space } (default: the shown space), or
// { folder, machine } for a space that doesn't exist yet: picking a row makes it there.

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, spaces, panes, knownAgents, run, closeOverlay, props, shared, setShared } from "herdr";

// The last agents each machine reported (shared with new-menu), shown at once while
// knownAgents() checks again.
const KNOWN = "new-menu.agents";
const ROW = 32;

function icon(a, size, color) {
  if (!a?.icon) return div().w(size).h(size).flex_none();
  if (a.tint) return svg(a.icon).size(size).flex_none().text_color(color);
  return div().w(size).h(size).flex_none().rounded(Math.round(size * 0.24)).overflow_hidden().child(image(a.icon).w(size).h(size));
}

export default class SessionNew extends View {
  init(_props, cx) {
    const s = this.space();
    const given = props() ?? {};
    // `folder`: the space doesn't exist yet (the folder picker chose where it starts),
    // so picking here makes the space instead of a tab in the shown one.
    this.folder = given.folder ?? null;
    this.where = this.folder !== null ? (given.machine ?? "") : (s?.machine ?? "");
    this.agents = shared(KNOWN)?.[this.where] ?? [];
    this.loading = true;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async (cx) => {
      try {
        this.agents = await knownAgents({ on: this.where || null });
        setShared(KNOWN, { ...(shared(KNOWN) ?? {}), [this.where]: this.agents });
      } catch { this.failed = true; }
      this.loading = false;
      cx.notify();
    });
  }

  space() {
    const id = props()?.space;
    const sp = spaces();
    return sp.find((s) => s.id === id) ?? sp.find((s) => s.active) ?? null;
  }

  // Where the space is now: its first terminal's folder, else where it was made.
  folderOf(s) {
    const tabs = new Set((s?.tabs ?? []).map((t) => t.id));
    return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s?.folder || null;
  }

  start(agent) {
    closeOverlay(props()?.overlay);
    // New space: its first tab is the agent, or a plain terminal.
    if (this.folder !== null) {
      run("space.new", {
        folder: this.folder,
        machine: this.where,
        ...(agent ? { tab: agent.name, argv: agent.run } : {}),
      });
      return;
    }
    const s = this.space();
    if (!s) return;
    const folder = this.folderOf(s);
    const args = { space: s.id, ...(folder ? { folder } : {}) };
    run("tab.new", agent ? { ...args, name: agent.name, argv: agent.run } : args);
  }

  row(t, id, pic, name, hint, enabled, onPick) {
    return h_flex().id(id).h(ROW).px(9).gap(10).rounded(7).items_center().flex_none()
      .text_color(enabled ? t.foreground : t.dim)
      .when(enabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.selected)).on_click(() => onPick()))
      .child(pic)
      .child(div().flex_1().min_w(0).truncate().child(name))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(hint));
  }

  render() {
    const t = theme();
    const s = this.space();
    const installed = this.agents.filter((a) => a.installed);
    const name = this.folder !== null
      ? (this.folder.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || this.folder)
      : (s?.name ?? "");
    const where = this.where || "This computer";
    return v_flex().w_full().bg(t.popover).p(5).text_size(12.8)
      .id("session-new").track_focus(this.handle)
      .on_key_down((e) => {
        if (e.modifiers.control || e.modifiers.platform || e.modifiers.alt) return;
        if (e.key === "t") return this.start(null);
        const a = /^[1-9]$/.test(e.key) ? installed[Number(e.key) - 1] : null;
        if (a) this.start(a);
      })
      .child(h_flex().px(9).pt(5).pb(6).gap(6).items_center().text_size(11).text_color(t.dim)
        .child(svg("mods/workspace-chrome/folder.svg").size(12).flex_none())
        .child(div().min_w(0).truncate().tooltip(this.folder ?? name).child(name))
        .child(div().flex_none().child(`· ${where}`)))
      .child(v_flex().id("agents").max_h(ROW * 8).overflow_y_scrollbar()
        .children(installed.map((a, i) => this.row(t, `a-${a.key}`, icon(a, 15, t.foreground), a.name, i < 9 ? String(i + 1) : "", true, () => this.start(a))))
        .when(installed.length === 0, (el) => el.child(div().px(9).py(7).text_color(t.dim)
          .child(this.failed ? "Couldn't check this machine's agents" : this.loading ? "Checking installed agents…" : "No agents installed here"))))
      .child(div().h(1).mx(4).my(5).bg(t.border).flex_none())
      .child(this.row(t, "terminal", svg("icons/shell.svg").size(15).flex_none(), "Terminal", "T", true, () => this.start(null)));
  }
}
