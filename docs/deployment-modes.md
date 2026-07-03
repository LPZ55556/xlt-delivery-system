# Deployment Modes

This project supports two production access modes. Do not commit real `.env.production`, `deploy/frpc.toml`, passwords, tokens, or keys.

## Mode A: FRP tunnel

Use this when the Ubuntu server is inside a private network. The compose stack runs `postgres`, `redis`, `api`, `web-admin`, and `frpc`. The remote `frps` exposes HTTP virtual hosts, for example:

- API: `http://api.lnize.top:8080`
- Web admin: `http://admin.lnize.top:8080`

`postgres` and `redis` stay inside the Docker network and are not published to the public internet. `deploy/frpc.toml` is created only on the server from `deploy/frpc.example.toml`.

## Mode B: direct public IP or domain

Use this when the Ubuntu server already has a public IP or a reverse proxy. Start the stack without `frpc` using:

```bash
docker-compose -f docker-compose.direct.yml config
docker-compose -f docker-compose.direct.yml up -d --build
```

The direct template publishes only API and Web ports, controlled by `PUBLIC_API_PORT` and `PUBLIC_WEB_PORT`. PostgreSQL and Redis are still private. For production, put Nginx or Caddy in front and enable HTTPS.

## Updating an existing server

When migrations are added, pull the new code and run migration deploy inside the API container. Never run `migrate reset` on production data.
