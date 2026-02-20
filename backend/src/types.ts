export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface SessionRecord {
  id: number;
  userId: number;
  token: string;
  createdAt: string;
}

export interface PipelineRecord {
  id: number;
  userId: number;
  name: string;
  description: string;
  createdAt: string;
}

export interface DbConnectionRecord {
  id: number;
  userId: number;
  name: string;
  dbType: 'sqlite';
  connectionString: string;
  createdAt: string;
}

export interface UiStateRecord {
  id: number;
  userId: number;
  componentKey: string;
  stateType: 'toggle' | 'form' | 'navigation';
  stateValue: string;
  updatedAt: string;
}
