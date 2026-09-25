#!/usr/bin/env python3
"""Tap an Android UI element by (partial) text or content-desc using a uiautomator dump.

Usage: python tools/adb-tap.py "<text>" [index]
Used for scripted visual verification on the connected device (M03).
"""
import re
import subprocess
import sys


def dump() -> str:
    subprocess.run(["adb", "shell", "uiautomator", "dump", "/sdcard/ui.xml"], capture_output=True)
    out = subprocess.run(["adb", "exec-out", "cat", "/sdcard/ui.xml"], capture_output=True)
    return out.stdout.decode("utf-8", errors="replace")


def main() -> int:
    needle = sys.argv[1]
    index = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    xml = dump()
    matches = []
    for node in re.finditer(r"<node [^>]*>", xml):
        attrs = node.group(0)
        text = re.search(r' text="([^"]*)"', attrs)
        desc = re.search(r' content-desc="([^"]*)"', attrs)
        hay = (text.group(1) if text else "") + " " + (desc.group(1) if desc else "")
        if needle in hay:
            b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', attrs)
            if b:
                x1, y1, x2, y2 = map(int, b.groups())
                matches.append(((x1 + x2) // 2, (y1 + y2) // 2))
    if len(matches) <= index:
        print(f"NOT FOUND: {needle}", file=sys.stderr)
        return 1
    x, y = matches[index]
    subprocess.run(["adb", "shell", "input", "tap", str(x), str(y)])
    print(f"tapped {needle} at {x},{y}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
