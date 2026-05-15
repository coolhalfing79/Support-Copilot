import { X, ExternalLink, Calendar, Tag, ShieldAlert } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Ticket } from '../store/adminStore'

interface TicketDetailProps {
  ticket: Ticket
  onClose: () => void
}

export const TicketDetail = ({ ticket, onClose }: TicketDetailProps) => {
  const { syncTicket, addTicketComment, isLoading } = useAdminStore()
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSync = () => {
    syncTicket(ticket.id)
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      await addTicketComment(ticket.id, comment.trim())
      setComment('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-[#161616]/80 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-2xl bg-[#262626] border border-[#393939] rounded-3xl overflow-hidden shadow-2xl shadow-black"
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#393939] flex items-center justify-between bg-[#161616]">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-[#f4f4f4]">Chat Details</h3>
              <p className="text-[10px] text-[#c6c6c6] uppercase tracking-widest font-bold">Ref: {ticket.jira_issue_key || ticket.id.slice(0, 8)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[#393939] text-[#c6c6c6] hover:text-[#f4f4f4] transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border
                  ${ticket.severity === 'critical' ? 'bg-[#da1e28]/10 text-[#da1e28] border-[#da1e28]/20' :
                  ticket.severity === 'high' ? 'bg-[#ff832b]/10 text-[#ff832b] border-[#ff832b]/20' :
                    'bg-[#0f62fe]/10 text-[#0f62fe] border-[#0f62fe]/20'}`}
              >
                {ticket.severity}
              </span>
              <span className="px-3 py-1 rounded-full bg-[#161616] border border-[#393939] text-[#c6c6c6] text-[10px] font-bold uppercase tracking-wider">
                {ticket.status}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-[#f4f4f4] leading-tight">{ticket.summary}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-bold text-[#c6c6c6] flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                Created At
              </label>
              <p className="text-sm text-[#f4f4f4] font-medium">
                {new Date(ticket.created_at).toLocaleString()}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-bold text-[#c6c6c6] flex items-center gap-2">
                <Tag className="w-3 h-3" />
                Product Module
              </label>
              <p className="text-sm text-[#f4f4f4] font-medium">
                {ticket.product_module || 'Unspecified'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] uppercase tracking-widest font-bold text-[#c6c6c6]">Issue Context</label>
            <div className="p-6 rounded-2xl bg-[#161616] border border-[#393939] text-sm text-[#c6c6c6] leading-relaxed whitespace-pre-wrap italic">
              {ticket.description || "System automatically escalated this session due to high complexity and critical severity keywords detected in user input."}
            </div>
          </div>

          {/* Comments Section */}
          <div className="space-y-6 pt-4 border-t border-[#393939]">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-widest font-bold text-[#c6c6c6]">Jira Comments</label>
              <button 
                onClick={handleSync}
                disabled={isLoading}
                className="flex items-center gap-2 text-[10px] font-bold text-[#0f62fe] hover:text-[#0043ce] uppercase tracking-widest disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                Sync Status
              </button>
            </div>

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {ticket.jira_comments && ticket.jira_comments.length > 0 ? (
                ticket.jira_comments.map((c, i) => (
                  <div key={c.id || i} className="p-4 rounded-xl bg-[#161616] border border-[#393939] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#393939] flex items-center justify-center">
                          <User className="w-3 h-3 text-[#c6c6c6]" />
                        </div>
                        <span className="text-[11px] font-bold text-[#f4f4f4]">{c.author || 'Jira User'}</span>
                        {c.source === 'admin' && (
                          <span className="px-1.5 py-0.5 rounded-md bg-[#0f62fe]/10 text-[#0f62fe] text-[8px] font-black uppercase tracking-tighter">Copilot Admin</span>
                        )}
                      </div>
                      <span className="text-[10px] text-[#8d8d8d]">{new Date(c.created).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-[#c6c6c6] leading-relaxed">{c.body}</p>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center bg-[#161616] rounded-xl border border-[#393939] border-dashed">
                  <p className="text-xs text-[#8d8d8d]">No comments in Jira yet.</p>
                </div>
              )}
            </div>

            <form onSubmit={handleAddComment} className="flex items-center gap-3">
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment to Jira..."
                className="flex-1 bg-[#161616] border border-[#393939] rounded-xl py-2.5 px-4 text-sm text-[#f4f4f4] focus:outline-none focus:border-[#0f62fe] focus:bg-[#262626] transition-all"
              />
              <button
                type="submit"
                disabled={!comment.trim() || isSubmitting}
                className="p-2.5 rounded-xl bg-[#0f62fe] text-white hover:bg-[#0043ce] disabled:opacity-50 transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-[#393939] bg-[#161616] flex items-center justify-between">
          <div className="text-xs text-[#8d8d8d]">
            Jira Sync: <span className={ticket.jira_synced ? "text-[#24a148] font-bold uppercase" : "text-amber-500 font-bold uppercase"}>
              {ticket.jira_synced ? "Healthy" : "Pending Sync"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-[#c6c6c6] hover:text-[#f4f4f4] transition-colors"
            >
              Close
            </button>
            {ticket.jira_issue_key && (
              <a
                href={`https://your-domain.atlassian.net/browse/${ticket.jira_issue_key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-2.5 rounded-xl bg-[#393939] border border-[#393939] text-[#f4f4f4] text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#525252] transition-all"
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
