# Security Policy

## Supported Versions

Only the latest stable release published on [GitHub Releases](https://github.com/Cristiant2608/mirros/releases/latest) receives security updates.

| Version | Supported |
| --- | --- |
| `1.2.x` (latest stable release) | ✅ Yes |
| `< 1.2.0` | ❌ No |

---

## Security & Privacy Architecture

1. **Strictly Local Loopback (`127.0.0.1`):**
   MirrOS's streaming and control server binds exclusively to `127.0.0.1` and never exposes ports on the local network (LAN).
2. **Origin Validation on Proxy & WebSocket:**
   The internal Electron proxy and binary `/control` WebSocket reject requests carrying external `Origin` headers before reaching the backend.
3. **Explicit User-Triggered Clipboard Only:**
   MirrOS never polls or reads the clipboard in the background; transfers only happen when the user explicitly triggers `Ctrl+C`, `Ctrl+V`, or the manual transfer buttons, with strict payload size limits.
4. **SHA-256 Verified Updates:**
   The built-in updater only accepts HTTPS releases from the official GitHub repository, verifies payload size, and checks the SHA-256 digest before replacing the portable binary (keeping a `.mirros-previous` backup).
5. **Redacted Diagnostics:**
   Both `mirros --diagnose` and `python -m mirros.diagnostics` strip UDIDs, personal device names, private user paths, and clipboard contents.

---

## Reporting a Vulnerability

- **Do not open a public GitHub Issue** if the vulnerability allows unauthorized access to the local server, arbitrary code execution, or exposure of sensitive device data.
- Use **[Report a vulnerability (GitHub Security Advisories)](https://github.com/Cristiant2608/mirros/security/advisories/new)** on this repository to submit a private report.
- Include reproduction steps, operating system (Windows/Linux), and MirrOS version. You will receive an initial response within 7 days.
