import { useEffect } from 'react'
import { 
  FileText, 
  Search, 
  Filter, 
  MoreVertical, 
  Calendar, 
  Database, 
  Share2, 
  Activity,
  CheckCircle,
  ExternalLink,
  ChevronRight
} from 'lucide-react'
import { useUserStore } from '../store/userStore'

export const SourcesPage = () => {
  const { availableSources, fetchAvailableSources } = useUserStore()

  useEffect(() => {
    fetchAvailableSources()
  }, [fetchAvailableSources])

  return (
    <div className="flex-1 h-full bg-[#f8f9fa] flex flex-col overflow-hidden">
      <header className="px-8 py-8 shrink-0">
        <div className="flex items-end justify-between mb-8">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Knowledge Sources</h1>
            <p className="text-gray-500 font-medium">Manage and monitor your AI's indexed information.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search sources..." 
                className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all w-64"
              />
            </div>
            <button className="p-2 bg-white border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Total Sources', value: availableSources.length.toString(), icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Total Entities', value: 'Dynamic soon', icon: Database, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Avg. Confidence', value: '96.4%', icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Used in Chats', value: '452', icon: Share2, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map((stat, idx) => (
            <div key={idx} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</span>
                <span className="text-xl font-bold text-gray-900">{stat.value}</span>
              </div>
            </div>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
        <div className="grid grid-cols-1 gap-4">
          {availableSources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
              <Database className="w-12 h-12 text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">No knowledge sources indexed yet.</p>
            </div>
          ) : (
            availableSources.map((source: any) => (
              <div 
                key={source.id}
                className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                      <FileText className="w-6 h-6 text-indigo-500" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-900 truncate">{source.title || source.url}</h3>
                        <span className={`px-2 py-0.5 rounded-full ${source.status === 'indexed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'} text-[10px] font-bold uppercase tracking-tighter flex items-center gap-1`}>
                          <CheckCircle className="w-2.5 h-2.5" />
                          {source.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Calendar className="w-3.5 h-3.5" />
                          Last indexed {source.last_indexed_at ? new Date(source.last_indexed_at).toLocaleDateString() : 'Never'}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 capitalize">
                          <div className="w-1 h-1 rounded-full bg-gray-300" />
                          {source.source_type} Source
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="hidden lg:flex items-center gap-12 text-center">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Entities</span>
                      <span className="text-sm font-bold text-gray-700">{source.entityCount || 0}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Chunks</span>
                      <span className="text-sm font-bold text-gray-700">{source.chunk_count || 0}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Confidence</span>
                      <span className={`text-sm font-bold ${(source.confidence || 0.95) * 100 > 95 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {((source.confidence || 0.95) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button className="p-2 hover:bg-gray-50 rounded-lg transition-colors">
                      <ExternalLink className="w-4 h-4 text-gray-400" />
                    </button>
                    <button className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-400">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    <div className="w-px h-6 bg-gray-100 mx-2" />
                    <button className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors">
                      View Graph
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  )
}
