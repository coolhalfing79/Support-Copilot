# Person 6 — Frontend: Admin View (Knowledge + Ticket Dashboard)

## Role: Frontend Engineer (Admin Experience)

---

## Task Overview

Build the admin dashboard — a comprehensive interface for support managers to manage knowledge sources, monitor ticket status, and view system metrics. This includes knowledge source entry, knowledge base dashboard, ticket dashboard with filtering, and overview metrics.

**Priority:** HIGH — Core admin feature
**Start Time:** Hour 2 (can start with mock API)
**Primary Completion Target:** Hours 8-12

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React 18 + TypeScript | 18.x |
| UI Components | shadcn/ui | Latest |
| Styling | Tailwind CSS | 3.x |
| State Management | Zustand | 4.x |
| Data Tables | TanStack Table | 8.x |
| Icons | Lucide React | 0.x |

---

## Detailed Task Breakdown

### 6.1 Project Setup

This person can reuse the same frontend project created by Person 5. The admin view is a separate route in the same application.

### 6.2 Directory Structure

```
frontend/
├── src/
│   ├── views/
│   │   └── admin/
│   │       ├── AdminLayout.tsx        # Admin layout wrapper
│   │       ├── AdminDashboard.tsx     # Overview metrics
│   │       ├── KnowledgePage.tsx      # Knowledge management
│   │       │   ├── AddSourceForm.tsx  # Form to add knowledge URL
│   │       │   └── SourceList.tsx     # Table of knowledge sources
│   │       └── TicketsPage.tsx        # Ticket dashboard
│   │           ├── TicketTable.tsx    # Ticket list
│   │           ├── TicketFilter.tsx   # Filter controls
│   │           └── TicketDetail.tsx   # Ticket detail modal
│   ├── stores/
│   │   └── adminStore.ts              # Admin state management
│   └── components/
│       └── knowledge/
│           ├── SourceCard.tsx
│           └── StatusBadge.tsx
```

### 6.3 Admin Store

**File:** `frontend/src/stores/adminStore.ts`

```typescript
import { create } from 'zustand';
import { api } from '../config/api';

interface KnowledgeSource {
  id: string;
  url: string;
  title?: string;
  source_type: string;
  status: 'pending' | 'processing' | 'indexed' | 'error';
  chunk_count: number;
  last_indexed_at?: string;
  created_at: string;
}

interface Ticket {
  id: string;
  jira_issue_key?: string;
  summary: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  product_module?: string;
  created_at: string;
}

interface MetricOverview {
  total_queries: number;
  resolution_rate: number;
  escalation_rate: number;
  avg_confidence_score: number;
  total_tickets: number;
  total_sessions: number;
}

interface AdminState {
  // Knowledge state
  knowledgeSources: KnowledgeSource[];
  isAddingSource: boolean;
  isRefreshing: string | null; // source ID being refreshed
  
  // Ticket state
  tickets: Ticket[];
  filterStatus: string | null;
  filterSeverity: string | null;
  selectedTicket: Ticket | null;
  
  // Analytics state
  metrics: MetricOverview | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadKnowledgeSources: () => Promise<void>;
  addKnowledgeSource: (url: string, title?: string) => Promise<void>;
  deleteKnowledgeSource: (id: string) => Promise<void>;
  reindexSource: (id: string) => Promise<void>;
  loadTickets: () => Promise<void>;
  setFilterStatus: (status: string | null) => void;
  setFilterSeverity: (severity: string | null) => void;
  openTicketDetail: (ticket: Ticket) => void;
  closeTicketDetail: () => void;
  loadMetrics: () => Promise<void>;
  clearError: () => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  // Initial state
  knowledgeSources: [],
  isAddingSource: false,
  isRefreshing: null,
  tickets: [],
  filterStatus: null,
  filterSeverity: null,
  selectedTicket: null,
  metrics: null,
  isLoading: false,
  error: null,
  
  // Knowledge actions
  loadKnowledgeSources: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/knowledge/sources');
      set({ knowledgeSources: response.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.error?.message || 'Failed to load sources', isLoading: false });
    }
  },
  
  addKnowledgeSource: async (url: string, title?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/knowledge/sources', { url, title });
      set((state) => ({
        knowledgeSources: [response.data, ...state.knowledgeSources],
        isLoading: false,
      }));
    } catch (err: any) {
      set({ error: err.response?.data?.error?.message || 'Failed to add source', isLoading: false });
    }
  },
  
  deleteKnowledgeSource: async (id: string) => {
    try {
      await api.delete(`/knowledge/sources/${id}`);
      set((state) => ({
        knowledgeSources: state.knowledgeSources.filter((s) => s.id !== id),
      }));
    } catch (err: any) {
      set({ error: err.response?.data?.error?.message || 'Failed to delete source' });
    }
  },
  
  reindexSource: async (id: string) => {
    set({ isRefreshing: id });
    try {
      await api.post(`/knowledge/sources/${id}/reindex`);
      // Update status to processing
      set((state) => ({
        knowledgeSources: state.knowledgeSources.map((s) =>
          s.id === id ? { ...s, status: 'processing' as const } : s
        ),
        isRefreshing: null,
      }));
    } catch (err: any) {
      set({ error: err.response?.data?.error?.message, isRefreshing: null });
    }
  },
  
  // Ticket actions
  loadTickets: async () => {
    set({ isLoading: true, error: null });
    try {
      const params: any = {};
      if (state.filterStatus) params.status = state.filterStatus;
      if (state.filterSeverity) params.severity = state.filterSeverity;
      
      const response = await api.get('/tickets', { params });
      set({ tickets: response.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.error?.message || 'Failed to load tickets', isLoading: false });
    }
  },
  
  setFilterStatus: (status: string | null) => set({ filterStatus: status }),
  setFilterSeverity: (severity: string | null) => set({ filterSeverity: severity }),
  
  openTicketDetail: (ticket: Ticket) => set({ selectedTicket: ticket }),
  closeTicketDetail: () => set({ selectedTicket: null }),
  
  // Analytics actions
  loadMetrics: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/analytics/overview');
      set({ metrics: response.data.metrics, isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.error?.message || 'Failed to load metrics', isLoading: false });
    }
  },
  
  clearError: () => set({ error: null }),
}));
```

### 6.4 Admin Layout

**File:** `frontend/src/views/admin/AdminLayout.tsx`

```typescript
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Database, Ticket, ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { useAdminStore } from '../../stores/adminStore';

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const loadMetrics = useAdminStore((s) => s.loadMetrics);
  const loadKnowledgeSources = useAdminStore((s) => s.loadKnowledgeSources);
  const loadTickets = useAdminStore((s) => s.loadTickets);
  
  useEffect(() => {
    // Load initial data
    loadMetrics();
    loadKnowledgeSources();
    loadTickets();
  }, [loadMetrics, loadKnowledgeSources, loadTickets]);
  
  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/knowledge', label: 'Knowledge Base', icon: Database },
    { path: '/admin/tickets', label: 'Tickets', icon: Ticket },
  ];
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/user')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to User View
            </Button>
            <h1 className="text-xl font-bold">Admin Dashboard</h1>
          </div>
        </div>
      </header>
      
      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="flex gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Button
                  key={item.path}
                  variant={isActive ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => navigate(item.path)}
                  className="gap-2"
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Button>
              );
            })}
          </div>
        </div>
      </nav>
      
      {/* Content */}
      <main className="container mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
```

### 6.5 Admin Dashboard (Overview)

**File:** `frontend/src/views/admin/AdminDashboard.tsx`

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminStore } from '../../stores/adminStore';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { TrendingUp, TrendingDown, MessageSquare, CheckCircle, AlertCircle, Users } from 'lucide-react';

export function AdminDashboard() {
  const { metrics, isLoading, error } = useAdminStore();
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  if (error) {
    return <div className="text-red-600">{error}</div>;
  }
  
  if (!metrics) {
    return <div className="text-gray-500">No metrics available</div>;
  }
  
  const statCards = [
    {
      title: 'Total Queries',
      value: metrics.total_queries.toLocaleString(),
      icon: MessageSquare,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Resolution Rate',
      value: `${metrics.resolution_rate}%`,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Escalation Rate',
      value: `${metrics.escalation_rate}%`,
      icon: AlertCircle,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100',
    },
    {
      title: 'Avg Confidence',
      value: metrics.avg_confidence_score.toFixed(2),
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: 'Total Tickets',
      value: metrics.total_tickets.toLocaleString(),
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
    {
      title: 'Total Sessions',
      value: metrics.total_sessions.toLocaleString(),
      icon: Users,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100',
    },
  ];
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard Overview</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {card.title}
                </CardTitle>
                <div className={`p-2 rounded-full ${card.bgColor}`}>
                  <Icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

### 6.6 Knowledge Management Page

**File:** `frontend/src/views/admin/KnowledgePage.tsx`

```typescript
import { useState } from 'react';
import { useAdminStore } from '../../stores/adminStore';
import { AddSourceForm } from './AddSourceForm';
import { SourceList } from './SourceList';

export function KnowledgePage() {
  const { loadKnowledgeSources } = useAdminStore();
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Knowledge Base Management</h2>
      
      <div className="mb-8">
        <AddSourceForm onSuccess={() => loadKnowledgeSources()} />
      </div>
      
      <SourceList />
    </div>
  );
}
```

**File:** `frontend/src/views/admin/AddSourceForm.tsx`

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAdminStore } from '../../stores/adminStore';
import { Plus, Loader2 } from 'lucide-react';

interface AddSourceFormProps {
  onSuccess: () => void;
}

export function AddSourceForm({ onSuccess }: AddSourceFormProps) {
  const { addKnowledgeSource, isLoading, error } = useAdminStore();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      await addKnowledgeSource(url.trim(), title.trim() || undefined);
      setUrl('');
      setTitle('');
      onSuccess();
    }
  };
  
  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Add Knowledge Source</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="url">URL</Label>
          <Input
            id="url"
            type="url"
            placeholder="https://docs.example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </div>
        
        <div>
          <Label htmlFor="title">Title (optional)</Label>
          <Input
            id="title"
            placeholder="Documentation Article Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        
        {error && <p className="text-sm text-red-600">{error}</p>}
        
        <Button type="submit" disabled={isLoading || !url.trim()}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Add Source
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
```

**File:** `frontend/src/views/admin/SourceList.tsx`

```typescript
import { useAdminStore } from '../../stores/adminStore';
import { StatusBadge } from '@/components/knowledge/StatusBadge';
import { RefreshCw, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SourceList() {
  const { knowledgeSources, isRefreshing, reindexSource, deleteKnowledgeSource, isLoading } = useAdminStore();
  
  if (isLoading) {
    return <div className="text-center py-8">Loading knowledge sources...</div>;
  }
  
  if (knowledgeSources.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
        <p>No knowledge sources added yet.</p>
        <p className="text-sm mt-2">Add a URL above to start building your knowledge base.</p>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-lg border">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Knowledge Sources ({knowledgeSources.length})</h3>
      </div>
      
      <div className="divide-y">
        {knowledgeSources.map((source) => (
          <div key={source.id} className="p-4 flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">{source.title || source.url}</h4>
                <StatusBadge status={source.status} />
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {source.url}
              </p>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span>{source.chunk_count} chunks</span>
                <span>Type: {source.source_type}</span>
                {source.last_indexed_at && (
                  <span>Last indexed: {new Date(source.last_indexed_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => reindexSource(source.id)}
                disabled={isRefreshing === source.id}
                title="Re-index"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing === source.id ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteKnowledgeSource(source.id)}
                title="Delete"
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              {source.url && (
                <Button variant="ghost" size="sm" onClick={() => window.open(source.url, '_blank')}>
                  <ExternalLink className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 6.7 Tickets Page

**File:** `frontend/src/views/admin/TicketsPage.tsx`

```typescript
import { useState } from 'react';
import { useAdminStore } from '../../stores/adminStore';
import { TicketFilter } from './TicketFilter';
import { TicketTable } from './TicketTable';
import { TicketDetail } from './TicketDetail';

export function TicketsPage() {
  const { selectedTicket } = useAdminStore();
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Ticket Management</h2>
      
      <TicketFilter />
      <TicketTable />
      
      {selectedTicket && <TicketDetail ticket={selectedTicket} />}
    </div>
  );
}
```

**File:** `frontend/src/views/admin/TicketFilter.tsx`

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminStore } from '../../stores/adminStore';
import { Filter, X } from 'lucide-react';

export function TicketFilter() {
  const { filterStatus, filterSeverity, setFilterStatus, setFilterSeverity, loadTickets } = useAdminStore();
  const [localStatus, setLocalStatus] = useState(filterStatus);
  const [localSeverity, setLocalSeverity] = useState(filterSeverity);
  
  const handleApply = () => {
    setFilterStatus(localStatus);
    setFilterSeverity(localSeverity);
    loadTickets();
  };
  
  const handleClear = () => {
    setFilterStatus(null);
    setFilterSeverity(null);
    setLocalStatus(null);
    setLocalSeverity(null);
    loadTickets();
  };
  
  const hasActiveFilters = filterStatus || filterSeverity;
  
  return (
    <div className="bg-white rounded-lg border p-4 mb-4">
      <div className="flex items-center gap-4">
        <Filter className="w-4 h-4 text-gray-500" />
        
        <Select value={localStatus || 'all'} onValueChange={(v) => setLocalStatus(v === 'all' ? null : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={localSeverity || 'all'} onValueChange={(v) => setLocalSeverity(v === 'all' ? null : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        
        <Button size="sm" onClick={handleApply}>Apply</Button>
        
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClear}>
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
```

**File:** `frontend/src/views/admin/TicketTable.tsx`

```typescript
import { useAdminStore } from '../../stores/adminStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Eye } from 'lucide-react';

export function TicketTable() {
  const { tickets, isLoading, selectedTicket, openTicketDetail } = useAdminStore();
  
  const severityColors: Record<string, string> = {
    low: 'bg-blue-100 text-blue-800',
    medium: 'bg-amber-100 text-amber-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  };
  
  const statusColors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-amber-100 text-amber-800',
    resolved: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
  };
  
  if (isLoading) {
    return <div className="text-center py-8">Loading tickets...</div>;
  }
  
  if (tickets.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
        <p>No tickets found.</p>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left p-4 text-sm font-medium text-gray-600">Key</th>
            <th className="text-left p-4 text-sm font-medium text-gray-600">Summary</th>
            <th className="text-left p-4 text-sm font-medium text-gray-600">Severity</th>
            <th className="text-left p-4 text-sm font-medium text-gray-600">Status</th>
            <th className="text-left p-4 text-sm font-medium text-gray-600">Created</th>
            <th className="text-right p-4 text-sm font-medium text-gray-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tickets.map((ticket) => (
            <tr key={ticket.id} className="hover:bg-gray-50">
              <td className="p-4">
                {ticket.jira_issue_key ? (
                  <a
                    href={`https://your-domain.atlassian.net/browse/${ticket.jira_issue_key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {ticket.jira_issue_key}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>
              <td className="p-4 max-w-xs truncate">{ticket.summary}</td>
              <td className="p-4">
                <Badge className={severityColors[ticket.severity]}>
                  {ticket.severity}
                </Badge>
              </td>
              <td className="p-4">
                <Badge className={statusColors[ticket.status]}>
                  {ticket.status.replace('_', ' ')}
                </Badge>
              </td>
              <td className="p-4 text-sm text-gray-500">
                {new Date(ticket.created_at).toLocaleDateString()}
              </td>
              <td className="p-4 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openTicketDetail(ticket)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**File:** `frontend/src/views/admin/TicketDetail.tsx`

```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, X } from 'lucide-react';
import { useAdminStore } from '../../stores/adminStore';

interface TicketDetailProps {
  ticket: any;
}

export function TicketDetail({ ticket }: TicketDetailProps) {
  const { selectedTicket, closeTicketDetail } = useAdminStore();
  
  if (!selectedTicket) return null;
  
  return (
    <Dialog open onOpenChange={(open) => !open && closeTicketDetail()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Ticket Details</DialogTitle>
            <Button variant="ghost" size="sm" onClick={closeTicketDetail}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {selectedTicket.jira_issue_key && (
              <a
                href={`https://your-domain.atlassian.net/browse/${selectedTicket.jira_issue_key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline flex items-center gap-1"
              >
                {selectedTicket.jira_issue_key}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <Badge>{selectedTicket.severity}</Badge>
            <Badge variant="outline">{selectedTicket.status}</Badge>
          </div>
          
          <div>
            <h4 className="font-medium">Summary</h4>
            <p className="text-gray-600">{selectedTicket.summary}</p>
          </div>
          
          {selectedTicket.description && (
            <div>
              <h4 className="font-medium">Description</h4>
              <p className="text-gray-600 whitespace-pre-wrap">{selectedTicket.description}</p>
            </div>
          )}
          
          {selectedTicket.product_module && (
            <div>
              <h4 className="font-medium">Product Module</h4>
              <p className="text-gray-600">{selectedTicket.product_module}</p>
            </div>
          )}
          
          <div className="text-sm text-gray-500">
            Created: {new Date(selectedTicket.created_at).toLocaleString()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### 6.8 Status Badge Component

**File:** `frontend/src/components/knowledge/StatusBadge.tsx`

```typescript
import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: 'pending' | 'processing' | 'indexed' | 'error';
}

const statusConfig = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-800' },
  processing: { label: 'Processing', className: 'bg-blue-100 text-blue-800' },
  indexed: { label: 'Indexed', className: 'bg-green-100 text-green-800' },
  error: { label: 'Error', className: 'bg-red-100 text-red-800' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return <Badge className={config.className}>{config.label}</Badge>;
}
```

---

## Acceptance Criteria

- [ ] Admin layout renders with navigation tabs
- [ ] Dashboard shows metric cards with data
- [ ] Knowledge page has working add source form
- [ ] Knowledge source list displays all sources with status
- [ ] Re-index and delete buttons work
- [ ] Ticket filter applies status and severity filters
- [ ] Ticket table displays all tickets with proper badges
- [ ] Ticket detail modal opens and shows full details
- [ ] Jira link opens in new tab
- [ ] All pages are responsive

---

## Dependencies

| Dependency | Owner | Status |
|------------|-------|--------|
| API endpoints | Person 3 | Required for real data |
| Analytics API | Person 4 | Required for dashboard |
| API schemas | Person 1 | Required for types |

## Deliverables To

| Recipient | What They Get |
|-----------|--------------|
| Person 7 | Testable frontend components |

---

## Tips for AI-Assisted Implementation

1. Reuse the same Vite project as Person 5 — add admin routes
2. Start with static components, then connect to API
3. Use shadcn/ui components for tables, dialogs, badges
4. The ticket filter can use URL params for shareable filtered views
5. Focus on clean data presentation — admin users need quick insights
6. Mock API responses if backend is not ready
7. Test the full admin workflow: add source → see processing → see indexed
