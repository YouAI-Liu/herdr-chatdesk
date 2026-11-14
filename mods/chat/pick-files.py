#!/usr/bin/env python3
# Native desktop file picker (macOS osascript / Linux xdg-desktop-portal FileChooser),
# supporting multiple files at once for the chat's attach button:
# prints each chosen POSIX path on its own line; prints nothing (exit 0) when cancelled.
import subprocess
import sys
from urllib.parse import unquote, urlparse

title = sys.argv[1] if len(sys.argv) > 1 else "Attach files"

if sys.platform == "darwin":
    script = '''
    on run argv
        set promptText to item 1 of argv
        try
            set chosenFiles to choose file with prompt promptText with multiple selections allowed
            set out to ""
            repeat with f in chosenFiles
                set out to out & (POSIX path of f) & linefeed
            end repeat
            return out
        on error number -128
            return ""
        end try
    end run
    '''
    try:
        res = subprocess.run(
            ["/usr/bin/osascript", "-e", script, title],
            capture_output=True,
            text=True,
            check=False,
        )
        paths = [line.strip() for line in (res.stdout or "").splitlines() if line.strip()]
        if paths:
            print("\n".join(paths))
        sys.exit(0)
    except Exception:
        sys.exit(0)

from gi.repository import Gio, GLib

bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
token = f"herdr_chat_{GLib.random_int()}"
sender = bus.get_unique_name()[1:].replace(".", "_")
path = f"/org/freedesktop/portal/desktop/request/{sender}/{token}"
loop = GLib.MainLoop()
chosen = []


def response(_bus, _sender, _path, _iface, _signal, params):
    code, results = params.unpack()
    if code == 0:
        for uri in results.get("uris", []):
            u = urlparse(uri)
            if u.scheme == "file":
                chosen.append(unquote(u.path))
    loop.quit()


bus.signal_subscribe("org.freedesktop.portal.Desktop", "org.freedesktop.portal.Request", "Response",
                     path, None, Gio.DBusSignalFlags.NONE, response)
bus.call_sync("org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop",
              "org.freedesktop.portal.FileChooser", "OpenFile",
              GLib.Variant("(ssa{sv})", ("", title, {
                  "handle_token": GLib.Variant("s", token),
                  "multiple": GLib.Variant("b", True),
                  "accept_label": GLib.Variant("s", "Attach"),
              })), GLib.VariantType("(o)"), Gio.DBusCallFlags.NONE, -1, None)
loop.run()
print("\n".join(chosen))
