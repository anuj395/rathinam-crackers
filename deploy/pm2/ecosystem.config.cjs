// PM2 process manifest for Rathinam Crackers API.
//
// Usage on the EC2 box:
//   pm2 startOrReload /var/www/ratinam/deploy/pm2/ecosystem.config.cjs --env production
//   pm2 save
//   pm2 startup            # then run the command pm2 prints, once
//
// Single-instance fork mode. Keeps memory + DB connection counts low for
// the typical small EC2 box (t3.small / t3.medium), and avoids the
// per-process duplication of the in-memory caches (permsCache, audit-log
// retention timer, payment-reminder scheduler). If you scale to a larger
// instance you can bump `instances` to 2 / "max" and switch to cluster
// mode — but make sure the schedulers are guarded against multi-fire.

module.exports = {
  apps: [
    {
      name: "ratinam-api",
      script: "artifacts/api-server/dist/index.mjs",
      cwd: "/var/www/ratinam",
      node_args: "--enable-source-maps",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "500M",
      kill_timeout: 10000,
      env_production: {
        NODE_ENV: "production",
        PORT: "8080",
      },
      error_file: "/var/log/ratinam/api.err.log",
      out_file: "/var/log/ratinam/api.out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
