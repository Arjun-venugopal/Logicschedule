module.exports = {
  apps: [
    {
      name: 'logicschedule-backend',
      script: './dist/index.js',
      // Cluster mode spreads load across all CPU cores automatically
      instances: process.env.PM2_INSTANCES || 'max',
      exec_mode: 'cluster',
      
      // Auto-restart if a worker crashes or exceeds memory threshold
      max_memory_restart: '1G',
      autorestart: true,
      watch: false,
      
      // Graceful reload timeouts for zero-downtime updates
      kill_timeout: 10000,
      listen_timeout: 8000,
      
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 5000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 5000,
      },
    },
  ],
};
