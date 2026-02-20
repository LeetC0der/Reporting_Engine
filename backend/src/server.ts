import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { z } from 'zod';
import {
  createConnection,
  createPipeline,
  createSession,
  createUser,
  deleteConnection,
  deletePipeline,
  findUserByEmail,
  getSessionByToken,
  initPlatformDb,
  listConnections,
  listPipelines,
  listSqliteTables,
  listUiState,
  upsertUiState
} from './database.js';

const app = express();
const logger = pino({ name: 'reporting-engine-api' });
const port = Number(process.env.PORT ?? 4000);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const loginSchema = signupSchema;

const uiStateSchema = z.object({
  componentKey: z.string().min(1),
  stateType: z.enum(['toggle', 'form', 'navigation']),
  stateValue: z.string().min(1)
});

const dbConnectionSchema = z.object({
  name: z.string().min(2),
  dbType: z.literal('sqlite'),
  connectionString: z.string().min(1)
});

const pipelineSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(2)
});

type AuthedRequest = express.Request & { userId: number };

const authMiddleware: express.RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const session = await getSessionByToken(token);

    if (!session) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    (req as AuthedRequest).userId = session.userId;
    next();
  } catch (error) {
    next(error);
  }
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/signup', async (req, res, next) => {
  try {
    const input = signupSchema.parse(req.body);
    const existing = await findUserByEmail(input.email);
    if (existing) {
      res.status(409).json({ error: 'Email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await createUser(input.email, passwordHash);
    const session = await createSession(user.id);

    res.status(201).json({ data: { token: session.token, user: { id: user.id, email: user.email } } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await findUserByEmail(input.email);

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const session = await createSession(user.id);
    res.json({ data: { token: session.token, user: { id: user.id, email: user.email } } });
  } catch (error) {
    next(error);
  }
});

app.use('/api', authMiddleware);

app.get('/api/me', async (req, res) => {
  res.json({ data: { userId: (req as AuthedRequest).userId } });
});

app.get('/api/ui-state', async (req, res, next) => {
  try {
    const states = await listUiState((req as AuthedRequest).userId);
    res.json({ data: states });
  } catch (error) {
    next(error);
  }
});

app.post('/api/ui-state', async (req, res, next) => {
  try {
    const input = uiStateSchema.parse(req.body);
    const saved = await upsertUiState((req as AuthedRequest).userId, input.componentKey, input.stateType, input.stateValue);
    res.status(201).json({ data: saved });
  } catch (error) {
    next(error);
  }
});

app.get('/api/connections', async (req, res, next) => {
  try {
    const connections = await listConnections((req as AuthedRequest).userId);
    res.json({ data: connections });
  } catch (error) {
    next(error);
  }
});

app.post('/api/connections', async (req, res, next) => {
  try {
    const input = dbConnectionSchema.parse(req.body);
    const connection = await createConnection((req as AuthedRequest).userId, input.name, input.dbType, input.connectionString);
    res.status(201).json({ data: connection });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/connections/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const removed = await deleteConnection((req as AuthedRequest).userId, id);

    if (!removed) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get('/api/connections/:id/tables', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const connections = await listConnections((req as AuthedRequest).userId);
    const connection = connections.find((item) => item.id === id);

    if (!connection) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }

    const tables = await listSqliteTables(connection.connectionString);
    res.json({ data: tables });
  } catch (error) {
    next(error);
  }
});

app.get('/api/pipelines', async (req, res, next) => {
  try {
    const pipelines = await listPipelines((req as AuthedRequest).userId);
    res.json({ data: pipelines });
  } catch (error) {
    next(error);
  }
});

app.post('/api/pipelines', async (req, res, next) => {
  try {
    const input = pipelineSchema.parse(req.body);
    const pipeline = await createPipeline((req as AuthedRequest).userId, input.name, input.description);
    res.status(201).json({ data: pipeline });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/pipelines/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const removed = await deletePipeline((req as AuthedRequest).userId, id);

    if (!removed) {
      res.status(404).json({ error: 'Pipeline not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Validation failed', details: error.flatten() });
    return;
  }

  logger.error({ error }, 'Unexpected server error');
  res.status(500).json({ error: 'Internal server error' });
});

const start = async (): Promise<void> => {
  await initPlatformDb();
  app.listen(port, () => {
    logger.info(`API listening on http://0.0.0.0:${port}`);
  });
};

void start();
