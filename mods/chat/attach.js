// Files for the message box: pasted (a clipboard image, or copied files) or dropped. They go
// to the agent the way its CLI reads them: as file paths in the message (Claude Code turns an
// image path into an image). An agent on another machine gets a copy there first (`hc put`).
// Pasted images are kept in data/chat-attach until the person sends or removes them.

import { exec, hc, appHome } from "herdr";
import * as fs from "fs/promises";

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i;
const base = (p) => String(p).split("/").filter(Boolean).pop() ?? p;
export const isImage = (p) => IMAGE.test(p);

const MAC_CLIPBOARD = `
function run(argv) {
  ObjC.import('AppKit');
  ObjC.import('Foundation');
  const pb = $.NSPasteboard.generalPasteboard;
  const classes = $.NSArray.arrayWithObject($.NSURL.class);
  const opts = $.NSDictionary.dictionaryWithObjectForKey($(true), $.NSPasteboardURLReadingFileURLsOnlyKey);
  const urls = pb.readObjectsForClassesOptions(classes, opts);
  if (urls && urls.count > 0) {
    const out = [];
    for (let i = 0; i < urls.count; i++) {
      const p = ObjC.unwrap(urls.objectAtIndex(i).path);
      if (p) out.push("FILE:" + p);
    }
    if (out.length > 0) return out.join("\\n");
  }
  if (!argv || argv.length === 0) return "";
  const dest = argv[0];
  let data = pb.dataForType($.NSPasteboardTypePNG);
  if (!data || data.length === 0) {
    const tiff = pb.dataForType($.NSPasteboardTypeTIFF);
    if (tiff && tiff.length > 0) {
      const rep = $.NSBitmapImageRep.imageRepWithData(tiff);
      if (rep) data = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary);
    }
  }
  if (data && data.length > 0) {
    data.writeToFileAtomically($(dest), true);
    return "IMG:" + dest;
  }
  return "";
}
`;

// Checks if macOS clipboard currently holds copied Finder file URLs (which also place filename text on pasteboard).
export async function fromClipboardFilesOnly() {
  const mac = await exec("sh", [
    "-c",
    'if [ "$(uname)" = Darwin ]; then /usr/bin/osascript -l JavaScript -e "$1" 2>/dev/null; fi',
    "x",
    MAC_CLIPBOARD,
  ]).catch(() => null);
  if (mac?.stdout?.trim()) {
    const files = mac.stdout.trim().split(/\r?\n/).filter((l) => l.startsWith("FILE:")).map((l) => l.slice(5));
    if (files.length) return paths(files);
  }
  return [];
}

// The clipboard's files or image, on macOS (AppKit NSPasteboard) or Linux (Wayland wl-paste).
// Returns [{ path, name, image, temp }] or [].
export async function fromClipboard() {
  const dir = `${appHome()}/data/chat-attach`;
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "")}-${Math.random().toString(36).slice(2, 6)}`;
  const macName = `pasted-${stamp}.png`;
  const macPath = `${dir}/${macName}`;
  const mac = await exec("sh", [
    "-c",
    'if [ "$(uname)" = Darwin ]; then mkdir -p "$1" && /usr/bin/osascript -l JavaScript -e "$2" "$3" 2>/dev/null; fi',
    "x",
    dir,
    MAC_CLIPBOARD,
    macPath,
  ]).catch(() => null);
  if (mac?.stdout?.trim()) {
    const lines = mac.stdout.trim().split(/\r?\n/).filter(Boolean);
    const files = lines.filter((l) => l.startsWith("FILE:")).map((l) => l.slice(5));
    if (files.length) return paths(files);
    if (lines.some((l) => l.startsWith("IMG:"))) {
      return [{ path: macPath, name: macName, image: true, temp: true }];
    }
  }

  const types = (await exec("sh", ["-c", "wl-paste --list-types 2>/dev/null"]).catch(() => null))?.stdout?.split("\n") ?? [];
  if (types.includes("text/uri-list")) {
    const r = await exec("sh", ["-c", "wl-paste -n -t text/uri-list 2>/dev/null"]);
    return paths(r.stdout.split(/\r?\n/).filter((l) => l.startsWith("file://")).map((l) => decodeURIComponent(l.slice(7))));
  }
  const type = types.find((t) => /^image\/(png|jpeg|gif|webp|bmp)$/.test(t));
  if (!type) return [];
  const name = `pasted-${stamp}.${type.split("/")[1].replace("jpeg", "jpg")}`;
  const r = await exec("sh", ["-c", 'mkdir -p "$1" && wl-paste -n -t "$2" > "$1/$3" && [ -s "$1/$3" ] && echo ok', "x", dir, type, name]);
  return r.stdout.trim() === "ok" ? [{ path: `${dir}/${name}`, name, image: true, temp: true }] : [];
}

// Dropped or pasted file paths as attachments.
export const paths = (list) => list.filter(Boolean).map((p) => ({ path: p, name: base(p), image: isImage(p), temp: false }));

// The message's file lines: each file's path where the agent is. For another machine, a copy
// lands beside the agent's terminal.
export async function deliver(files, addr, machine) {
  const out = [];
  for (const f of files) {
    if (!machine) { out.push(f.path); continue; }
    const r = await hc(["put", addr, f.path, "--json"]);
    let landed = null;
    try { landed = JSON.parse(r.stdout || "{}").path ?? null; } catch { landed = r.stdout.trim() || null; }
    if (r.code !== 0 || !landed) throw new Error(`${f.name} didn't reach ${machine}: ${(r.stderr || r.stdout).trim()}`);
    out.push(landed);
  }
  return out;
}

// A pasted image removed before sending goes. Sent ones stay a day (the agent may read them
// later), then go.
export function drop(f) {
  if (f.temp && f.path.startsWith(`${appHome()}/data/chat-attach/`)) exec("rm", ["-f", f.path]);
}
export function prune() {
  exec("sh", ["-c", 'find "$1" -name "pasted-*" -mmin +1440 -delete 2>/dev/null; true', "x", `${appHome()}/data/chat-attach`]);
}

// Images shown in the chat (thumbnails, the viewer): `image()` loads from the app's folder, so
// each one is linked (or copied) into data/chat-attach/view, with its pixel size for fitting.
// Resolves { <path>: { rel, w, h } } for the ones that exist here and are images.
const VIEW = `
d="$1"; shift; mkdir -p "$d"
att="\${d%/view}"
for orig in "$@"; do
  p="$orig"
  case "$p" in
    "~/"*) p="$HOME/\${p#~/}" ;;
  esac
  if [ ! -f "$p" ] && [ -f "$att/\${p##*/}" ]; then
    p="$att/\${p##*/}"
  fi
  [ -f "$p" ] || continue
  s=""
  if command -v sips >/dev/null 2>&1; then
    s=$(sips -g pixelWidth -g pixelHeight "$p" 2>/dev/null | awk '/pixelWidth:/{w=$2} /pixelHeight:/{h=$2} END{if(w>0&&h>0) print w, h}')
  fi
  [ -n "$s" ] || s=$(magick identify -format '%w %h' "$p[0]" 2>/dev/null) || s=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=' ' "$p" 2>/dev/null)
  [ -n "$s" ] || continue
  n=$(printf '%s' "$orig" | cksum | cut -d' ' -f1)-$(printf '%s' "\${p##*/}" | tr -c 'A-Za-z0-9._-' '_')
  [ -f "$d/$n" ] || ln -f "$p" "$d/$n" 2>/dev/null || cp "$p" "$d/$n" 2>/dev/null || continue
  printf '%s\\t%s\\t%s\\n' "$orig" "$n" "$s"
done
true`;
export async function viewable(list) {
  const dir = `${appHome()}/data/chat-attach/view`;
  const r = await exec("sh", ["-c", VIEW, "view", dir, ...list]).catch(() => null);
  const out = {};
  for (const line of (r?.stdout ?? "").split("\n")) {
    const [p, n, size] = line.split("\t");
    const [w, h] = (size ?? "").split(" ").map(Number);
    if (p && n && w && h) out[p] = { rel: `data/chat-attach/view/${n}`, w, h };
  }
  return out;
}

// A w×h image covering a size×size square: its drawn size and offset (the middle shows).
export function cover(w, h, size) {
  const k = size / Math.min(w, h);
  const dw = Math.round(w * k), dh = Math.round(h * k);
  return { w: dw, h: dh, left: Math.round((size - dw) / 2), top: Math.round((size - dh) / 2) };
}

// A big paste kept as a text file (sent by path like other files): data/chat-attach, named
// after its first line.
export async function textFile(text) {
  const first = String(text).split("\n").find((l) => l.trim())?.trim() ?? "pasted text";
  const slug = first.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "pasted-text";
  const name = `pasted-${Date.now().toString(36)}-${slug}.txt`;
  const path = `${appHome()}/data/chat-attach/${name}`;
  try {
    await exec("mkdir", ["-p", `${appHome()}/data/chat-attach`]);
    await fs.writeFile(path, text);
  } catch { return null; }
  return { path, name: first.length > 40 ? first.slice(0, 39) + "…" : first, image: false, text: true, temp: true };
}
