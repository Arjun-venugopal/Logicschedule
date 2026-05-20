import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db';
import helmet from 'helmet';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

app.use(helmet());
app.use(cors());
app.use(express.json());

import authRoutes from './routes/authRoutes';
import teacherRoutes from './routes/teacherRoutes';
import batchRoutes from './routes/batchRoutes';
import scheduleRoutes from './routes/scheduleRoutes';
import statsRoutes from './routes/statsRoutes';
import studentRoutes from './routes/studentRoutes';
import { notFound, errorHandler } from './middleware/errorMiddleware';

app.use('/auth', authRoutes);
app.use('/teachers', teacherRoutes);
app.use('/batches', batchRoutes);
app.use('/schedules', scheduleRoutes);
app.use('/stats', statsRoutes);
app.use('/students', studentRoutes);

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

const PORT = process.env.PORT || 5000;

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
