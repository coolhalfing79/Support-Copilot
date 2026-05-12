import { X, ExternalLink, Calendar, Tag, ShieldAlert } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Ticket } from '../store/adminStore'

interface TicketDetailProps {
  ticket: Ticket
  onClose: () => void
}

export const TicketDetail = ({ ticket, onClose }: TicketDetailProps) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-black"
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Ticket Details</h3>
              <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Ref: {ticket.jira_issue_key || ticket.id.slice(0, 8)}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/5 text-white/20 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-4">
             <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border
                  ${ticket.severity === 'critical' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 
                    ticket.severity === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                    'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}
                >
                  {ticket.severity}
                </span>
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/40 text-[10px] font-bold uppercase tracking-wider">
                  {ticket.status}
                </span>
             </div>
             <h2 className="text-2xl font-bold text-white leading-tight">{ticket.summary}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-bold text-white/40 flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                Created At
              </label>
              <p className="text-sm text-white/80 font-medium">
                {new Date(ticket.created_at).toLocaleString()}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-bold text-white/40 flex items-center gap-2">
                <Tag className="w-3 h-3" />
                Product Module
              </label>
              <p className="text-sm text-white/80 font-medium">
                {ticket.product_module || 'Unspecified'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
             <label className="text-[10px] uppercase tracking-widest font-bold text-white/40">Issue Context</label>
             <div className="p-6 rounded-2xl bg-white/5 border border-white/5 text-sm text-white/60 leading-relaxed whitespace-pre-wrap italic">
               "System automatically escalated this session due to high complexity and critical severity keywords detected in user input."
             </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-white/5 bg-black/40 flex items-center justify-between">
          <div className="text-xs text-white/20">
            Jira Sync: <span className="text-emerald-500 font-bold uppercase">Healthy</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors"
            >
              Close
            </button>
            {ticket.jira_issue_key && (
              <a 
                href={`https://your-domain.atlassian.net/browse/${ticket.jira_issue_key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-white/10 transition-all"
              >
                View in Jira
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
