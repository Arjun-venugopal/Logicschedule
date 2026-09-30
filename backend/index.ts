process.env.TZ = process.env.TZ || 'Asia/Kolkata';

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectSupabase, isSupabaseConfigured } from './config/supabase';
import helmet from 'helmet';
import { config } from './config/config';
import jwt from 'jsonwebtoken';

const app = express();
const httpServer = createServer(app);

// Configure allowed origins for security
const allowedOrigins = ['http://localhost:3000'];
if (config.FRONTEND_URL) {
  const origins = config.FRONTEND_URL.split(',').map((o) => o.trim());
  allowedOrigins.push(...origins);
}

// Reusable CORS validation function
const corsOriginVerifier = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // Allow requests with no origin (like server-to-server or test scripts)
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
};

// Initialize socket.io with the secure CORS configuration
const io = new Server(httpServer, {
  cors: {
    origin: corsOriginVerifier,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

import rateLimit from 'express-rate-limit';

// Global rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

app.set('trust proxy', 1);

app.use(helmet());
app.use(limiter);
app.use(cors({
  origin: corsOriginVerifier,
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
import demoSlotRoutes from './routes/demoSlotRoutes';
import userRoutes from './routes/userRoutes';
import salesRoutes from './routes/salesRoutes';
import demoReportRoutes from './routes/demoReportRoutes';
import { notFound, errorHandler } from './middleware/errorMiddleware';

app.use('/auth', authRoutes);
app.use('/teachers', teacherRoutes);
app.use('/batches', batchRoutes);
app.use('/schedules', scheduleRoutes);
app.use('/stats', statsRoutes);
app.use('/students', studentRoutes);
app.use('/demo-sessions', demoRoutes);
app.use('/demo-slots', demoSlotRoutes);
app.use('/users', userRoutes);
app.use('/sales-people', salesRoutes);
app.use('/demo-reports', demoReportRoutes);

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  res.send('API is running...');
});

app.use(notFound);
app.use(errorHandler);

// Real-time socket authentication & room isolation
io.use((socket, next) => {
  const authHeader = socket.handshake.headers?.authorization;
  const token = socket.handshake.auth?.token || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined);
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;
    socket.data.user = decoded;
    next();
  } catch {
    next();
  }
});

io.on('connection', (socket) => {
  const user = socket.data?.user;
  if (user) {
    const userId = user.id || user._id;
    if (userId) socket.join(`user:${userId}`);
    if (user.role) socket.join(`role:${user.role}`);
  }

  socket.on('disconnect', () => {
    // Room memberships are automatically cleaned up by Socket.IO
  });
});

const PORT = config.PORT;

if (isSupabaseConfigured()) {
  connectSupabase();
} else {
  console.warn('⚠️  Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
}

// Connection Management: Keep-alive timeouts tailored for reverse proxies (Nginx / ALB)
httpServer.keepAliveTimeout = 65000;
httpServer.headersTimeout = 66000;

httpServer.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  httpServer.close(() => {
    console.log('✅ Closed HTTP and WebSocket servers. Clean exit.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('⚠️ Shutdown timeout exceeded, force exiting.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { io, httpServer };
export default app;
