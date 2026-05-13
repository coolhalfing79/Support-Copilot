import { motion } from 'framer-motion'
import { Ticket, ExternalLink, ArrowRight } from 'lucide-react'

interface TicketNotificationProps {
  ticketId: string
  status?: string
}

export const TicketNotification = ({ ticketId, status = 'PENDING' }: TicketNotificationProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="bg-rose-50 border border-rose-200 p-4 rounded-2xl mb-6 relative overflow-hidden group shadow-sm"
    >
      <div className="absolute top-0 right-0 p-8 bg-rose-100/50 blur-2xl rounded-full" />
      
      <div className="flex items-start gap-4 relative z-10">
        <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center border border-rose-200">
          <Ticket className="w-6 h-6 text-[#da1e28]" />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-[#da1e28] uppercase tracking-tight">Support Ticket Created</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-[#da1e28] font-bold border border-rose-200">
              {status}
            </span>
          </div>
          <p className="text-xs text-[#525252] mb-3 leading-relaxed">
            Your request has been escalated to our L3 support team. You can track the progress using the ticket ID below.
          </p>
          
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-white rounded-lg px-3 py-2 border border-[#e0e0e0] font-mono text-[11px] text-[#161616]">
              ID: {ticketId}
            </div>
            <button className="flex items-center gap-2 text-[11px] font-bold text-[#0f62fe] hover:text-[#161616] transition-colors group">
              View Ticket
              <ExternalLink className="w-3 h-3" />
              <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
