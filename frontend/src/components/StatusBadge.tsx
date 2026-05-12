export type KnowledgeStatus = 'pending' | 'processing' | 'indexed' | 'error'
 
 interface StatusBadgeProps {
   status: KnowledgeStatus
 }
 
 interface StatusConfigEntry {
   label: string
   color: string
   bgColor: string
   dotColor: string
   pulse?: boolean
 }
 
 const statusConfig: Record<KnowledgeStatus, StatusConfigEntry> = {
   pending: { label: 'Pending', color: 'text-white/40', bgColor: 'bg-white/5', dotColor: 'bg-white/20' },
   processing: { label: 'Processing', color: 'text-nebula-blue', bgColor: 'bg-nebula-blue/10', dotColor: 'bg-nebula-blue', pulse: true },
   indexed: { label: 'Indexed', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', dotColor: 'bg-emerald-400' },
   error: { label: 'Error', color: 'text-rose-400', bgColor: 'bg-rose-500/10', dotColor: 'bg-rose-400' },
 }
 
 export const StatusBadge = ({ status }: StatusBadgeProps) => {
   const config = statusConfig[status] || statusConfig.pending

  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/5 ${config.bgColor} ${config.color} text-[10px] font-bold uppercase tracking-wider`}>
      <div className="relative flex h-1.5 w-1.5">
        {config.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.dotColor}`}></span>
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${config.dotColor}`}></span>
      </div>
      {config.label}
    </div>
  )
}
