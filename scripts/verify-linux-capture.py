"""Exercise only synthetic selection text in a fresh CI GTK/X11 session."""
import os
import subprocess
import sys
import threading

import gi

gi.require_version("Gtk", "3.0")
from gi.repository import GLib, Gtk

if os.environ.get("NYMKEEP_CAPTURE_ISOLATED") != "1":
    raise SystemExit("This fixture requires an isolated display and D-Bus session.")

target = sys.argv[1] if len(sys.argv) > 1 else "x86_64-unknown-linux-gnu"
result = 0


def exercise(case):
    global result
    window = Gtk.Window(title="Nymkeep synthetic capture fixture")
    entry = Gtk.Entry()
    prefix = "outside prefix "
    entry.set_text(prefix + "mira@example.com" + " outside suffix")
    if case == "password":
        entry.set_visibility(False)
    window.add(entry)
    window.show_all()
    entry.grab_focus()
    window.present()
    if case != "empty":
        entry.select_region(len(prefix), len(prefix) + len("mira@example.com"))
    else:
        entry.select_region(0, 0)

    background = None
    if case == "background":
        background = window
        window = Gtk.Window(title="Nymkeep active empty fixture")
        active = Gtk.Entry()
        active.set_text("synthetic unselected text")
        window.add(active)
        window.show_all()
        active.grab_focus()
        window.present()

    def check():
        def worker():
            global result
            environment = dict(os.environ, NYMKEEP_CAPTURE_CASE=case)
            command = ["cargo", "test", "--locked", "-j", "2", "--target", target,
                       "--test", "linux_capture", "--", "--ignored", "--test-threads=1"]
            try:
                outcome = subprocess.run(command, cwd="src-tauri", env=environment,
                                         check=False, timeout=60)
                if outcome.returncode:
                    result = outcome.returncode
            except subprocess.TimeoutExpired:
                result = 1
            GLib.idle_add(Gtk.main_quit)

        threading.Thread(target=worker, daemon=True).start()
        return GLib.SOURCE_REMOVE

    GLib.timeout_add(1500, check)
    Gtk.main()
    window.destroy()
    if background is not None:
        background.destroy()
    while Gtk.events_pending():
        Gtk.main_iteration()


for fixture_case in ("selected", "empty", "password", "background"):
    exercise(fixture_case)
    if result:
        break
raise SystemExit(result)
