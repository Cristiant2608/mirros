"""Cierre acotado de sesiones y procesos propios, sin terminar procesos ajenos."""

from functools import wraps
import os
import signal
import subprocess
import threading
from urllib.request import Request, urlopen


class TerminationRequested(KeyboardInterrupt):
    def __init__(self, signum):
        self.signum = signum


def shutdown_signals(function):
    """Convert SIGTERM to stack unwinding and restore the caller's handlers."""
    @wraps(function)
    def wrapped(*args, **kwargs):
        if threading.current_thread() is not threading.main_thread():
            return function(*args, **kwargs)
        previous = signal.getsignal(signal.SIGTERM)
        def terminate(signum, _frame):
            # A second signal must not interrupt cleanup.
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            raise TerminationRequested(signum)
        signal.signal(signal.SIGTERM, terminate)
        try:
            return function(*args, **kwargs)
        finally:
            signal.signal(signal.SIGTERM, previous)
    return wrapped


def process_options():
    return ({"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt"
            else {"start_new_session": True})


def start_process(*args, **kwargs):
    """Remember ownership even if a launcher exits before its descendants."""
    process = subprocess.Popen(*args, **kwargs, **process_options())
    process._mirros_process_group = os.name != 'nt'
    return process


def stop_process(process):
    if process is None:
        return
    if os.name == "nt":
        if process.poll() is None:
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           creationflags=subprocess.CREATE_NO_WINDOW, timeout=10, check=False)
            process.wait(timeout=5)
        return
    # Only signal a group when we created it; callers can pass ordinary Popen objects.
    own_group = getattr(process, '_mirros_process_group', False)
    if not own_group:
        try:
            own_group = os.getpgid(process.pid) == process.pid
        except ProcessLookupError:
            process.wait()
            return
    def send(sig):
        try:
            if own_group:
                os.killpg(process.pid, sig)
            elif process.poll() is None:
                process.send_signal(sig)
        except ProcessLookupError:
            pass
    send(signal.SIGTERM)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    finally:
        # The parent may have exited while a descendant ignored SIGTERM.
        send(signal.SIGKILL)
        process.wait(timeout=5)


def stop_server(process, port, grace=7):
    """Ask the backend to release input, then fall back to killing its process tree."""
    if process is None:
        return
    try:
        if port and process.poll() is None:
            request = Request(f"http://127.0.0.1:{port}/session/end", method="POST")
            try:
                with urlopen(request, timeout=2) as response:
                    if response.status == 200:
                        process.wait(timeout=grace)
            except (OSError, subprocess.TimeoutExpired):
                pass
    finally:
        stop_process(process)
