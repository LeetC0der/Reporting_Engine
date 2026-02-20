import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { z } from 'zod';
import {
  createConnection,
  initPlatformDb,
  listConnections,
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

const uiStateSchema = z.object({
  componentKey: z.string().min(1),
  stateType: z.enum(['toggle', 'form']),
  stateValue: z.string().min(1)
});

const dbConnectionSchema = z.object({
  name: z.string().min(2),
  dbType: z.literal('sqlite'),
  connectionString: z.string().min(1)
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/ui-state', async (_req, res, next) => {
  try {
    const states = await listUiState();
    res.json({ data: states });
  } catch (error) {
    next(error);
  }
});

app.post('/api/ui-state', async (req, res, next) => {
  try {
    const input = uiStateSchema.parse(req.body);
    const saved = await upsertUiState(input.componentKey, input.stateType, input.stateValue);
    res.status(201).json({ data: saved });
  } catch (error) {
    next(error);
  }
});

app.get('/api/connections', async (_req, res, next) => {
  try {
    const connections = await listConnections();
    res.json({ data: connections });
  } catch (error) {
    next(error);
  }
});

app.post('/api/connections', async (req, res, next) => {
  try {
    const input = dbConnectionSchema.parse(req.body);
    const connection = await createConnection(input.name, input.dbType, input.connectionString);
    res.status(201).json({ data: connection });
  } catch (error) {
    next(error);
  }
});

app.get('/api/connections/:id/tables', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const connections = await listConnections();
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
