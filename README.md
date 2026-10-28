# Operations Voice

Anonymous Operations feedback portal. Reports do not request names, email addresses, or employee numbers. Authorized leads read reports at `/admin` with a six-digit PIN.

## Deploy on Render

This repository includes `render.yaml`. Create a Blueprint from the repository and Render will ask for `ADMIN_PIN`; choose a private six-digit PIN. `SESSION_SECRET` is generated automatically. Reports are saved on a persistent disk at `/var/data`.

## Local use

Requires Node.js 22 or newer. No packages need to be installed. Set `ADMIN_PIN` to a private six-digit value and `SESSION_SECRET` to a random value of at least 32 characters, then run `node server.mjs`. Open `http://localhost:3000`; team leads use `http://localhost:3000/admin`.

## Privacy

The form has no identity fields, but this does not guarantee complete anonymity. Hosting providers, company networks, and browsers may retain connection metadata, and report details can identify a person. Ask reporters to avoid names and identifying details. Do not use this channel for immediate danger. Agree on report retention, access, and backup rules before inviting employees to use it.
