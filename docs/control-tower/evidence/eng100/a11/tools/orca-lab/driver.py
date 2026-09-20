"""Keyboard-only journeys under Orca, recording what Orca speaks after each step.

Runs inside the uc-a11-orca container. Every action is a real X keyboard event
(xdotool); every observation is Orca's own "SPEECH OUTPUT" from its debug log.
The password is pasted from the clipboard (never typed), so no keystroke log
contains it; the host scrubs the transcript for it again before keeping it.
"""
import json
import re
import subprocess
import sys
import time

LOG = '/home/tester/out/orca-debug.raw.log'
OUT = '/home/tester/out/transcript.json'
SECRETS = json.load(open('/secrets/identity.json'))
pos = 0
transcript = []


def new_speech():
    global pos
    try:
        with open(LOG, 'r', errors='replace') as f:
            f.seek(pos)
            data = f.read()
            pos = f.tell()
    except FileNotFoundError:
        return []
    out = []
    for line in data.splitlines():
        m = re.search(r"SPEECH OUTPUT: '(.*?)'(?: voice=\w+)?", line)
        if m and m.group(1).strip():
            out.append(m.group(1))
    return out


def save():
    json.dump(transcript, open(OUT, 'w'), indent=1)


def step(journey, name, action, wait=1.5):
    new_speech()
    if action:
        action()
    time.sleep(wait)
    spoken = new_speech()
    transcript.append({'t': time.strftime('%H:%M:%S'), 'journey': journey, 'step': name, 'speech': spoken})
    print(f'[{journey}] {name}: ' + ' | '.join(spoken), flush=True)
    save()
    return spoken


def key(*keys):
    subprocess.run(['xdotool', 'key', '--clearmodifiers', *keys], check=False)


def typ(text):
    subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '60', text], check=False)


def paste(text):
    p = subprocess.Popen(['xclip', '-selection', 'clipboard'], stdin=subprocess.PIPE)
    p.communicate(text.encode())
    time.sleep(0.3)
    key('ctrl+v')


def tab_until(journey, pattern, limit=30, back=False):
    for _ in range(limit):
        spoken = step(journey, f'{"Shift+" if back else ""}Tab (seeking /{pattern}/)', lambda: key('shift+Tab' if back else 'Tab'), 1.2)
        if re.search(pattern, ' '.join(spoken), re.I):
            return True
    step(journey, f'NOT FOUND /{pattern}/ after {limit} Tabs', None, 0)
    return False


def wait_for_window(title='Umrah Connect', limit=240):
    """Wait for the Firefox window, then for the page title to show the app."""
    name = ''
    for _ in range(limit):
        r = subprocess.run(['xdotool', 'search', '--onlyvisible', '--class', 'firefox'], capture_output=True, text=True)
        for wid in r.stdout.split():
            name = subprocess.run(['xdotool', 'getwindowname', wid], capture_output=True, text=True).stdout.strip()
            if title in name:
                subprocess.run(['xdotool', 'windowactivate', '--sync', wid], check=False)
                return True
        time.sleep(1)
    subprocess.run(['import', '-window', 'root', '/home/tester/out/timeout.png'], check=False)
    print(f'window title at timeout: {name!r}', flush=True)
    return False


def main():
    if not wait_for_window():
        transcript.append({'journey': 'setup', 'step': 'firefox window never appeared', 'speech': []})
        save()
        return 2
    step('setup', 'Firefox shows /login (window title contains Umrah Connect)', None, 6)

    # J1 — sign in: find the fields by what Orca announces, fail once, then succeed.
    # Text is pasted (Ctrl+V passes through Orca in browse and focus mode alike;
    # typed letters would be taken as browse-mode quick keys).
    J = 'J1 sign-in'
    tab_until(J, r'Email address entry')
    step(J, 'paste the account email (clipboard)', lambda: paste(SECRETS['email']), 1.5)
    tab_until(J, r'Password password text', limit=4)
    step(J, 'paste a WRONG password (clipboard)', lambda: paste('Not-the-password-1'), 1.2)
    tab_until(J, r'Sign in push button', limit=6)
    step(J, 'press Enter on Sign in (expect the error to be announced)', lambda: key('Return'), 5)
    tab_until(J, r'Password password text', limit=8, back=True)
    step(J, 'select the password text (Ctrl+A)', lambda: key('ctrl+a'), 0.8)
    step(J, 'paste the real password (clipboard)', lambda: paste(SECRETS['password']), 1.2)
    tab_until(J, r'Sign in push button', limit=6)
    step(J, 'press Enter on Sign in (expect the workspace)', lambda: key('Return'), 12)

    # J2 — navigate to a list with the keyboard: skip link, then the menu.
    J = 'J2 list'
    step(J, 'Orca: top of document (Ctrl+Home)', lambda: key('ctrl+Home'), 1.5)
    tab_until(J, r'Skip to content link', limit=40)
    tab_until(J, r'My Requests link', limit=30)
    step(J, 'press Enter on the menu link (client navigation)', lambda: key('Return'), 8)
    step(J, 'Orca: next heading (h)', lambda: key('h'), 2)
    step(J, 'Orca: next heading (h)', lambda: key('h'), 2)
    step(J, 'Orca: next list (l)', lambda: key('l'), 2)

    # J3 — open a dialog from the list page.
    J = 'J3 dialog'
    tab_until(J, r'New request push button', limit=30, back=True)
    step(J, 'press Enter to open the dialog', lambda: key('Return'), 3)

    # J4 — submit the form with an error, then close the dialog.
    J = 'J4 form error'
    tab_until(J, r'Post request push button', limit=25)
    step(J, 'press Enter on Post request with an empty title (expect the error)', lambda: key('Return'), 3)
    step(J, 'Tab inside the dialog (focus stays in the dialog)', lambda: key('Tab'), 1.2)
    step(J, 'press Escape (dialog closes, focus returns)', lambda: key('Escape'), 3)

    # J5 — account menu in the header: open, move, close.
    J = 'J5 menu'
    tab_until(J, r'Account menu', limit=40, back=True)
    step(J, 'press Enter to open the menu', lambda: key('Return'), 2)
    step(J, 'Down arrow', lambda: key('Down'), 1.2)
    step(J, 'Down arrow', lambda: key('Down'), 1.2)
    step(J, 'press Escape (menu closes, focus returns)', lambda: key('Escape'), 2)
    save()
    return 0


if __name__ == '__main__':
    sys.exit(main())
