import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db';
import helmet from 'helmet';
import { config } from './config/config';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

app.use(helmet());
const allowedOrigins = [
  'http://localhost:3000'
];

if (config.FRONTEND_URL) {
  const origins = config.FRONTEND_URL.split(',').map((o) => o.trim());
  allowedOrigins.push(...origins);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      (config.NODE_ENV !== 'production' && (
        origin.startsWith('http://localhost:') ||
        /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin)
      ));

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-CSRF-Token', 'Accept-Version', 'Content-Length', 'Content-MD5', 'Date', 'X-Api-Version']
}));
app.use(express.json());

import authRoutes from './routes/authRoutes';
import teacherRoutes from './routes/teacherRoutes';
import batchRoutes from './routes/batchRoutes';
import scheduleRoutes from './routes/scheduleRoutes';
import statsRoutes from './routes/statsRoutes';
import studentRoutes from './routes/studentRoutes';
import demoRoutes from './routes/demoRoutes';
import { notFound, errorHandler } from './middleware/errorMiddleware';

app.use('/auth', authRoutes);
app.use('/teachers', teacherRoutes);
app.use('/batches', batchRoutes);
app.use('/schedules', scheduleRoutes);
app.use('/stats', statsRoutes);
app.use('/students', studentRoutes);
app.use('/demo-sessions', demoRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

app.use(notFound);
app.use(errorHandler);

// Real-time socket logic
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = config.PORT;

connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
  });
}).catch(() => {
  // DB failed but still start server so we can show proper API errors
  httpServer.listen(PORT, () => {
    console.log(`⚠️  Server running on port ${PORT} — MongoDB not connected. Update MONGO_URI in .env`);
  });
});

export default app;
