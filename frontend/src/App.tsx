import { FormEvent, useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AppShell,
  Badge,
  Box,
  Button,
  Card,
  Group,
  PasswordInput,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';

type AuthResponse = { data: { token: string; user: { id: number; email: string } } };
type UiStateItem = { componentKey: string; stateValue: string; stateType: string };
type Pipeline = { id: number; name: string; description: string; createdAt: string };
type Connection = { id: number; name: string; dbType: 'sqlite'; connectionString: string; createdAt: string };

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

async function apiRequest<T>(path: string, token?: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorBody.error ?? `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function ConfirmDialog(props: {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  triggerText: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button color="red" variant="light">
          {props.triggerText}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="content">
          <Stack>
            <Dialog.Title>{props.title}</Dialog.Title>
            <Dialog.Description>{props.description}</Dialog.Description>
            <Group justify="flex-end">
              <Dialog.Close asChild>
                <Button variant="default">Cancel</Button>
              </Dialog.Close>
              <Button
                color="red"
                onClick={async () => {
                  await props.onConfirm();
                  setOpen(false);
                }}
              >
                Confirm
              </Button>
            </Group>
          </Stack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function App() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string>(() => localStorage.getItem('sessionToken') ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  const [selectedTab, setSelectedTab] = useState('pipeline');
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  const [tables, setTables] = useState<string[]>([]);

  const authed = token.length > 0;

  const uiStateQuery = useQuery({
    queryKey: ['ui-state', token],
    queryFn: () => apiRequest<{ data: UiStateItem[] }>('/api/ui-state', token),
    enabled: authed
  });

  const pipelinesQuery = useQuery({
    queryKey: ['pipelines', token],
    queryFn: () => apiRequest<{ data: Pipeline[] }>('/api/pipelines', token),
    enabled: authed
  });

  const connectionsQuery = useQuery({
    queryKey: ['connections', token],
    queryFn: () => apiRequest<{ data: Connection[] }>('/api/connections', token),
    enabled: authed
  });

  useEffect(() => {
    const states = uiStateQuery.data?.data ?? [];
    const navState = states.find((item) => item.componentKey === 'active-tab');
    const toggleState = states.find((item) => item.componentKey === 'feature-toggle');
    const formState = states.find((item) => item.componentKey === 'profile-form');

    if (navState) {
      setSelectedTab(JSON.parse(navState.stateValue).tab);
    }
    if (toggleState) {
      setFeatureEnabled(Boolean(JSON.parse(toggleState.stateValue).enabled));
    }
    if (formState) {
      setDisplayName(String(JSON.parse(formState.stateValue).displayName ?? ''));
    }
  }, [uiStateQuery.data]);

  const saveUiMutation = useMutation({
    mutationFn: (payload: { componentKey: string; stateType: 'toggle' | 'form' | 'navigation'; stateValue: string }) =>
      apiRequest('/api/ui-state', token, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ui-state', token] });
    }
  });

  const authMutation = useMutation({
    mutationFn: () =>
      apiRequest<AuthResponse>(`/api/auth/${authMode}`, undefined, {
        method: 'POST',
        body: JSON.stringify({ email, password })
      }),
    onSuccess: (payload) => {
      setToken(payload.data.token);
      localStorage.setItem('sessionToken', payload.data.token);
    }
  });

  const pipelineCreateMutation = useMutation({
    mutationFn: (payload: { name: string; description: string }) =>
      apiRequest('/api/pipelines', token, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pipelines', token] });
    }
  });

  const pipelineDeleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/pipelines/${id}`, token, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pipelines', token] });
    }
  });

  const connectionCreateMutation = useMutation({
    mutationFn: (payload: { name: string; connectionString: string }) =>
      apiRequest('/api/connections', token, {
        method: 'POST',
        body: JSON.stringify({ ...payload, dbType: 'sqlite' })
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['connections', token] });
    }
  });

  const connectionDeleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/connections/${id}`, token, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['connections', token] });
      setTables([]);
    }
  });

  const pipelineColumns = useMemo<ColumnDef<Pipeline>[]>(
    () => [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'description', header: 'Description' },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <ConfirmDialog
            title="Delete pipeline"
            description={`Delete '${row.original.name}'? This cannot be undone.`}
            triggerText="Remove"
            onConfirm={async () => pipelineDeleteMutation.mutateAsync(row.original.id)}
          />
        )
      }
    ],
    [pipelineDeleteMutation]
  );

  const connectionColumns = useMemo<ColumnDef<Connection>[]>(
    () => [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'connectionString', header: 'SQLite Path' },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <ConfirmDialog
            title="Delete connection"
            description={`Delete '${row.original.name}'? This cannot be undone.`}
            triggerText="Remove"
            onConfirm={async () => connectionDeleteMutation.mutateAsync(row.original.id)}
          />
        )
      }
    ],
    [connectionDeleteMutation]
  );

  const pipelines = pipelinesQuery.data?.data ?? [];
  const connections = connectionsQuery.data?.data ?? [];

  const pipelineTable = useReactTable({ data: pipelines, columns: pipelineColumns, getCoreRowModel: getCoreRowModel() });
  const connectionTable = useReactTable({
    data: connections,
    columns: connectionColumns,
    getCoreRowModel: getCoreRowModel()
  });

  if (!authed) {
    return (
      <Box maw={420} mx="auto" mt={60}>
        <Card withBorder>
          <Stack>
            <Title order={2}>{authMode === 'login' ? 'Login' : 'Sign up'}</Title>
            <TextInput label="Email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
            <PasswordInput
              label="Password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            <Button onClick={() => authMutation.mutate()} loading={authMutation.isPending}>
              {authMode === 'login' ? 'Login' : 'Create account'}
            </Button>
            <Button variant="subtle" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>
              {authMode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Login'}
            </Button>
            {authMutation.error ? <Text c="red">{authMutation.error.message}</Text> : null}
          </Stack>
        </Card>
      </Box>
    );
  }

  return (
    <AppShell padding="md">
      <AppShell.Main>
        <Stack>
          <Group justify="space-between">
            <Title order={2}>Dashboard</Title>
            <Button
              variant="light"
              onClick={() => {
                localStorage.removeItem('sessionToken');
                setToken('');
              }}
            >
              Logout
            </Button>
          </Group>

          <Tabs
            value={selectedTab}
            onChange={(value) => {
              const tab = value ?? 'pipeline';
              setSelectedTab(tab);
              saveUiMutation.mutate({ componentKey: 'active-tab', stateType: 'navigation', stateValue: JSON.stringify({ tab }) });
            }}
          >
            <Tabs.List>
              <Tabs.Tab value="pipeline">Pipeline</Tabs.Tab>
              <Tabs.Tab value="connections">Connections</Tabs.Tab>
              <Tabs.Tab value="settings">Settings</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="pipeline" pt="md">
              <Card withBorder>
                <Stack>
                  <Title order={4}>Create pipeline</Title>
                  <form
                    onSubmit={(event: FormEvent<HTMLFormElement>) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      void pipelineCreateMutation.mutateAsync({
                        name: String(form.get('name') ?? ''),
                        description: String(form.get('description') ?? '')
                      });
                      event.currentTarget.reset();
                    }}
                  >
                    <Stack>
                      <TextInput name="name" label="Pipeline name" required />
                      <TextInput name="description" label="Description" required />
                      <Button type="submit" loading={pipelineCreateMutation.isPending}>
                        Create pipeline
                      </Button>
                    </Stack>
                  </form>
                  <Table>
                    <Table.Thead>
                      {pipelineTable.getHeaderGroups().map((headerGroup) => (
                        <Table.Tr key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <Table.Th key={header.id}>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </Table.Th>
                          ))}
                        </Table.Tr>
                      ))}
                    </Table.Thead>
                    <Table.Tbody>
                      {pipelineTable.getRowModel().rows.map((row) => (
                        <Table.Tr key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <Table.Td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Td>
                          ))}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Stack>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="connections" pt="md">
              <Card withBorder>
                <Stack>
                  <Title order={4}>Create DB connection</Title>
                  <form
                    onSubmit={(event: FormEvent<HTMLFormElement>) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      void connectionCreateMutation.mutateAsync({
                        name: String(form.get('name') ?? ''),
                        connectionString: String(form.get('connectionString') ?? '')
                      });
                      event.currentTarget.reset();
                    }}
                  >
                    <Stack>
                      <TextInput name="name" label="Connection name" required />
                      <TextInput name="connectionString" label="SQLite file path" required />
                      <Button type="submit" loading={connectionCreateMutation.isPending}>
                        Add connection
                      </Button>
                    </Stack>
                  </form>

                  <Group>
                    <TextInput
                      label="Inspect tables by connection id"
                      placeholder="Connection ID"
                      value={selectedConnectionId ? String(selectedConnectionId) : ''}
                      onChange={(event) => setSelectedConnectionId(Number(event.currentTarget.value))}
                    />
                    <Button
                      mt={24}
                      onClick={async () => {
                        if (!selectedConnectionId) {
                          return;
                        }
                        const response = await apiRequest<{ data: string[] }>(
                          `/api/connections/${selectedConnectionId}/tables`,
                          token
                        );
                        setTables(response.data);
                      }}
                    >
                      Load tables
                    </Button>
                  </Group>

                  <Group>
                    {tables.map((table) => (
                      <Badge key={table}>{table}</Badge>
                    ))}
                  </Group>

                  <Table>
                    <Table.Thead>
                      {connectionTable.getHeaderGroups().map((headerGroup) => (
                        <Table.Tr key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <Table.Th key={header.id}>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </Table.Th>
                          ))}
                        </Table.Tr>
                      ))}
                    </Table.Thead>
                    <Table.Tbody>
                      {connectionTable.getRowModel().rows.map((row) => (
                        <Table.Tr key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <Table.Td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Td>
                          ))}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Stack>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel value="settings" pt="md">
              <Card withBorder>
                <Stack>
                  <Title order={4}>Settings (server-managed state)</Title>
                  <Group>
                    <Text>Feature toggle</Text>
                    <Button
                      variant={featureEnabled ? 'filled' : 'light'}
                      onClick={() => {
                        const next = !featureEnabled;
                        setFeatureEnabled(next);
                        saveUiMutation.mutate({
                          componentKey: 'feature-toggle',
                          stateType: 'toggle',
                          stateValue: JSON.stringify({ enabled: next })
                        });
                      }}
                    >
                      {featureEnabled ? 'Enabled' : 'Disabled'}
                    </Button>
                  </Group>

                  <form
                    onSubmit={(event: FormEvent<HTMLFormElement>) => {
                      event.preventDefault();
                      saveUiMutation.mutate({
                        componentKey: 'profile-form',
                        stateType: 'form',
                        stateValue: JSON.stringify({ displayName })
                      });
                    }}
                  >
                    <Stack>
                      <TextInput
                        label="Display name"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.currentTarget.value)}
                      />
                      <Button type="submit">Save profile state to Node.js</Button>
                    </Stack>
                  </form>
                </Stack>
              </Card>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
