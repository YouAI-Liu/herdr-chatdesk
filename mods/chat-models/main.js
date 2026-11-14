// DSH (DeepSeek Harness) style two-level Model / Reasoning Effort / Permission popover (mods/chat-models).
// Matches DSH's ModelSelect & PermissionSelect:
// - Root pane: two clean rows ("模型  <Icon> <Model> ›" and "推理等级  <Effort> ›")
// - Model pane: drill-down list with provider icon + model name + checkmark (click to switch immediately)
// - Effort pane: drill-down list of supported reasoning efforts (click to switch immediately)
// - Perm pane: compact permission preset list opened from the left shield button (click to switch immediately)

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input, VirtualListScrollHandle, v_virtual_list, Scrollbar } from "gpui-base";
import { theme, props, setShared, closeOverlay, home, readTextFile, writeTextFile } from "herdr";
import { ALL_AGENTS, modelSections, parsePicks, pickKey, withPin, withRecent, PICKS_FILE } from "./core/agents.js";

const LEVEL = { minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max", ultra: "Ultra", none: "None" };
export const ROW = 34, HEAD = 28, SEARCH = 36, LIST = 7 * 34, NOTE = 22;
const picksPath = () => `${home()}/${PICKS_FILE}`;

export default class ModelMenu extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.p = p;
    if (p.pick) { this.handle = cx.focus_handle(); cx.timer.after(0, () => this.handle.focus()); return; }
    const c = p.current ?? {};
    this.was = { agent: c.agent, model: c.model, effort: c.effort ?? null, fast: Boolean(c.fast), perm: c.perm ?? null };
    this.sel = { ...this.was };
    this.settingsMode = p.mode === "settings";
    this.tab = this.sel.agent && p.menus?.[this.sel.agent] ? this.sel.agent : Object.keys(p.menus ?? {})[0] ?? "claude";
    this.pane = p.initialPane || (p.select ? "model" : "root");
    this.cursor = 0;
    this.pressX = null;
    this.picks = parsePicks(readTextFile(picksPath()));
    this.handle = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    this.input = InputState.new({ placeholder: "搜索模型…" });
    this.input.on("change", (_e, cx) => {
      this.cursor = 0;
      this.scroll.scroll_to_item(0);
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => {
      const rows = this.sections().flatMap((s) => s.rows);
      const r = rows[this.cursor];
      if (!r) return;
      this.chooseAndApply(r, cx);
    });
    cx.timer.after(0, () => this.handle.focus());
    // /model <name>: the model was named, so switch to it; a name that matches nothing leaves the list open.
    if (p.select) {
      const row = this.models().find((m) => m.agent === p.select.agent && m.id === p.select.model);
      if (row) cx.timer.after(0, (cx) => this.chooseAndApply(row, cx));
    }
  }

  models(agent = null) {
    return Object.entries(this.p.menus ?? {})
      .filter(([a]) => !agent || a === agent)
      .flatMap(([a, m]) => (m.models ?? []).map((x) => ({ ...x, agent: a })));
  }

  model(s = this.sel) {
    return this.models().find((m) => m.agent === s.agent && m.id === s.model) ?? null;
  }

  level(s = this.sel) {
    const m = this.model(s);
    const list = m?.efforts ?? [];
    if (!list.length) return null;
    return list.includes(s.effort) ? s.effort : m?.defaultEffort ?? list[0];
  }

  sections() {
    return modelSections(this.p.menus ?? {}, this.tab, this.picks, this.input.value());
  }

  choose(m) {
    const prev = this.sel.agent;
    const same = m.agent === this.was.agent && m.id === this.was.model;
    const keep = m.efforts?.includes(this.sel.effort) ? this.sel.effort : null;
    // No level set so far stays unset: the CLI's own default for the model applies, not one pinned here.
    const unset = this.was.effort == null && this.sel.effort == null;
    const effort = unset ? null : same && m.efforts?.includes(this.was.effort) ? this.was.effort : keep ?? m.defaultEffort ?? m.efforts?.[0] ?? null;
    const perm = m.agent === prev ? this.sel.perm : m.agent === this.was.agent ? this.was.perm : this.p.permDefault?.[m.agent] ?? "auto";
    this.sel = { agent: m.agent, model: m.id, effort, fast: Boolean(m.fast && this.sel.fast), perm };
  }

  savePicks(next) {
    this.picks = next;
    writeTextFile(picksPath(), JSON.stringify(next, null, 2) + "\n");
  }

  changes() {
    const w = this.was, s = this.sel, m = this.model(s);
    const out = [];
    if (s.agent !== w.agent || s.model !== w.model) out.push(m?.name ?? s.model);
    if (this.level(s) !== this.level(w)) out.push(LEVEL[this.level(s)] ?? this.level(s));
    if (Boolean(m?.fast && s.fast) !== Boolean(this.model(w)?.fast && w.fast)) out.push(s.fast ? "Fast" : "Standard");
    if (s.perm !== w.perm) out.push(this.p.menus?.[s.agent]?.perms?.find((x) => x.id === s.perm)?.label ?? s.perm);
    return out;
  }

  restart(cx) {
    const s = this.sel, m = this.model(s);
    if (!this.changes().length) {
      closeOverlay(this.p.overlay);
      return;
    }
    if (this.p.offline) return;
    this.savePicks(withRecent(this.picks, pickKey(s.agent, s.model)));
    setShared("chat.restartreq", {
      pane: this.p.pane,
      at: Date.now(),
      pick: { agent: s.agent, model: s.model, effort: s.effort == null ? null : this.level(s), fast: Boolean(m?.fast && s.fast), perm: s.perm },
    });
    closeOverlay(this.p.overlay);
    cx.notify();
  }

  chooseAndApply(row, cx) {
    this.choose(row);
    if (this.settingsMode) {
      this.tell();
      this.pane = "root";
      cx.notify();
      return;
    }
    this.restart(cx);
  }

  icon(agentName, t) {
    const ic = this.p.icons?.[agentName];
    if (!ic?.icon) return svg("my-icons/t3-claude.svg").size(14).flex_none();
    return ic.tint
      ? svg(ic.icon).size(14).flex_none().text_color(t.foreground)
      : image(ic.icon).size(14).flex_none();
  }

  check(t, on) {
    return div().size(15).flex_none().flex().items_center().justify_center()
      .when(on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).text_color(t.foreground)));
  }

  pickList(t) {
    const p = this.p;
    const pick = (o) => {
      setShared("newspace.pick", { key: p.key, field: p.pick, value: o.id, at: Date.now() });
      closeOverlay(p.overlay);
    };
    return v_flex().id("pick-list").w(p.width ?? 260).h(p.height ?? 200).p(6).bg(t.popover).text_size(12.8).text_color(t.foreground)
      .track_focus(this.handle)
      .children((p.options ?? []).map((o) => h_flex().id(`pick-${o.id}`).h(ROW).flex_none().px(10).gap(10).rounded(8).items_center().cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { cx.stop_propagation(); pick(o); cx.notify(); })
        .when(Boolean(o.icon), (el) => el.child(o.tint ? svg(o.icon).size(14).flex_none().text_color(t.foreground) : image(o.icon).size(14).flex_none()))
        .child(div().flex_1().min_w(0).truncate().child(o.label))
        .child(this.check(t, o.id === p.current))));
  }

  tell() {
    if (!this.settingsMode) return;
    const s = this.sel;
    setShared("newspace.pick", { key: this.p.key, field: "settings", value: { agent: s.agent, model: s.model, effort: s.effort, fast: s.fast, perm: s.perm }, at: Date.now() });
  }

  // Pane 1: DSH Root Menu ("模型  <Icon> <Model> ›" + "推理等级  <Effort> ›")
  renderRootPane(t, m, eff) {
    const modelName = m?.name ?? this.sel.model ?? "选择模型";
    const effortLabel = eff ? (LEVEL[eff] ?? eff) : null;
    return v_flex().id("model-menu-root").w_full().p(6).gap(2).rounded(14).bg(t.popover).border_1().border_color(t.border).shadow_lg()
      .text_size(13).text_color(t.foreground)
      .child(h_flex().id("cell-model").h(36).px(10).gap(10).rounded(9).items_center().cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.pane = "model";
          this.input.set_value("");
          cx.notify();
        })
        .child(div().flex_none().font_medium().text_color(t.foreground).child("模型"))
        .child(h_flex().flex_1().min_w(0).justify_end().items_center().gap(6)
          .child(this.icon(this.sel.agent, t))
          .child(div().min_w(0).truncate().text_size(12.5).text_color(t.muted).child(modelName))
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(12).flex_none().text_color(t.dim))))
      .when(Boolean(m?.efforts?.length), (el) => el.child(
        h_flex().id("cell-effort").h(36).px(10).gap(10).rounded(9).items_center().cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => {
            cx.stop_propagation();
            this.pane = "effort";
            cx.notify();
          })
          .child(div().flex_none().font_medium().text_color(t.foreground).child("推理等级"))
          .child(h_flex().flex_1().min_w(0).justify_end().items_center().gap(6)
            .child(div().truncate().text_size(12.5).text_color(t.muted).child(effortLabel ?? "High"))
            .child(svg("mods/workspace-chrome/chevron-right.svg").size(12).flex_none().text_color(t.dim)))
      ));
  }

  // Pane 2: DSH Model Selection List
  renderModelPane(t, rows, cur) {
    const allCount = this.models(this.sel.agent).length;
    const showSearch = allCount > 5;
    return v_flex().id("model-menu-models").w_full().p(6).gap(2).rounded(14).bg(t.popover).border_1().border_color(t.border).shadow_lg()
      .text_size(13).text_color(t.foreground)
      .child(h_flex().id("back-from-model").h(30).px(8).gap(6).rounded(8).items_center().cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { cx.stop_propagation(); this.pane = "root"; this.handle.focus(); cx.notify(); })
        .child(svg("mods/workspace-chrome/chevron-left.svg").size(12).flex_none().text_color(t.dim))
        .child(div().text_size(12).font_medium().text_color(t.muted).child("模型")))
      .when(showSearch, (el) => el.child(h_flex().h(SEARCH).flex_none().px(4).pb(2).items_center()
        .child(h_flex().w_full().h(30).px(9).gap(7).rounded(8).bg(t.raised).border_1().border_color(t.border).items_center()
          .child(svg("mods/workspace-chrome/search.svg").size(12.5).flex_none().text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.5).text_color(t.foreground)))))
      .child(rows.length === 0
        ? div().h(ROW).px(10).flex().items_center().text_size(12).text_color(t.dim).child("没有匹配的模型")
        : v_flex().id("model-list-scroll").w_full().max_h(LIST).overflow_y_scroll().gap(2)
            .children(rows.map((x, idx) => this.modelRow(t, x, x === cur, idx))));
  }

  // Pane 3: DSH Reasoning Effort Selection List
  renderEffortPane(t, m, on) {
    const efforts = m?.efforts ?? [];
    return v_flex().id("model-menu-efforts").w_full().p(6).gap(2).rounded(14).bg(t.popover).border_1().border_color(t.border).shadow_lg()
      .text_size(13).text_color(t.foreground)
      .child(h_flex().id("back-from-effort").h(30).px(8).gap(6).rounded(8).items_center().cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { cx.stop_propagation(); this.pane = "root"; this.handle.focus(); cx.notify(); })
        .child(svg("mods/workspace-chrome/chevron-left.svg").size(12).flex_none().text_color(t.dim))
        .child(div().text_size(12).font_medium().text_color(t.muted).child("推理等级")))
      .children(efforts.map((e) => h_flex().id(`effort-${e}`).h(ROW).px(10).gap(10).rounded(8).items_center().cursor_pointer()
        .when(on === e, (el) => el.bg(t.raised))
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.sel = { ...this.sel, effort: e };
          if (this.settingsMode) {
            this.tell();
            this.pane = "root";
            cx.notify();
            return;
          }
          this.restart(cx);
        })
        .child(div().flex_1().font_medium().text_color(t.foreground).child(LEVEL[e] ?? e))
        .child(this.check(t, on === e))));
  }

  // Pane 4: DSH Permission Presets Menu (opened from the left shield button)
  renderPermPane(t) {
    const perms = this.p.menus?.[this.sel.agent]?.perms ?? [];
    return v_flex().id("model-menu-perms").w_full().p(6).gap(2).rounded(14).bg(t.popover).border_1().border_color(t.border).shadow_lg()
      .text_size(13).text_color(t.foreground)
      .children(perms.map((x) => h_flex().id(`perm-${x.id}`).h(ROW).px(10).gap(10).rounded(8).items_center().cursor_pointer()
        .when(this.sel.perm === x.id, (el) => el.bg(t.raised))
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.sel = { ...this.sel, perm: x.id };
          if (this.settingsMode) {
            this.tell();
            closeOverlay(this.p.overlay);
            return;
          }
          this.restart(cx);
        })
        .child(svg("mods/chat-models/shield.svg").size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().font_medium().text_color(t.foreground).child(x.label))
        .child(this.check(t, this.sel.perm === x.id))));
  }

  render(cx) {
    const t = theme();
    if (this.p.pick) return this.pickList(t);
    if (this.settingsMode && this.told !== JSON.stringify(this.sel)) {
      const first = this.told === undefined;
      this.told = JSON.stringify(this.sel);
      if (!first) cx.timer.after(0, () => this.tell());
    }
    const m = this.model();
    const eff = this.level(this.sel);
    const sections = this.sections();
    const rows = sections.flatMap((s) => s.rows);
    this.cursor = Math.max(0, Math.min(this.cursor, rows.length - 1));
    const cur = rows[this.cursor];

    let card;
    if (this.pane === "perm") card = this.renderPermPane(t);
    else if (this.pane === "model") card = this.renderModelPane(t, rows, cur);
    else if (this.pane === "effort") card = this.renderEffortPane(t, m, eff);
    else card = this.renderRootPane(t, m, eff);

    return v_flex().id("model-menu-area").w(this.p.width ?? 270).h(this.p.height ?? 340).justify_end()
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") {
          cx.stop_propagation();
          if (this.pane === "model" || this.pane === "effort") {
            this.pane = "root";
            cx.notify();
          } else {
            closeOverlay(this.p.overlay);
          }
          return;
        }
        if (this.pane === "model") {
          if (e.key === "down") { this.cursor = Math.min(rows.length - 1, this.cursor + 1); cx.stop_propagation(); cx.notify(); }
          else if (e.key === "up") { this.cursor = Math.max(0, this.cursor - 1); cx.stop_propagation(); cx.notify(); }
        }
      })
      .child(card.on_mouse_down_out(() => closeOverlay(this.p.overlay)));
  }

  modelRow(t, x, at, idx = 0) {
    const chosen = x.agent === this.sel.agent && x.id === this.sel.model;
    return h_flex().id(`m-row-${idx}`).w_full().h(ROW).flex_none().px(10).gap(9).rounded(8).items_center().cursor_pointer()
      .when(at || chosen, (el) => el.bg(chosen ? t.raised : t.selected))
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        this.chooseAndApply(x, cx);
      })
      .child(this.icon(x.agent, t))
      .child(div().flex_1().min_w(0).truncate().font_medium().text_color(t.foreground).child(x.name))
      .child(this.check(t, chosen));
  }
}
