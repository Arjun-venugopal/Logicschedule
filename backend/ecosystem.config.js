module.exports = {
  apps: [
    {
      name: 'logicschedule-backend',
      script: './dist/index.js',
      // Cluster mode: Default to 2 workers to conserve system memory while ensuring high availability
      instances: process.env.PM2_INSTANCES ? (isNaN(Number(process.env.PM2_INSTANCES)) ? process.env.PM2_INSTANCES : Number(process.env.PM2_INSTANCES)) : 2,
      exec_mode: 'cluster',
      
      // Auto-restart if a worker crashes or exceeds memory threshold
      max_memory_restart: '350M',
      autorestart: true,
      watch: false,
      
      // Graceful reload timeouts for zero-downtime updates
      kill_timeout: 10000,
      listen_timeout: 8000,
      
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 5000,
        NODE_OPTIONS: '--max-old-space-size=384',
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 5000,
      },
    },
  ],
};
