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
  pending: { label: 'Pending', color: 'text-[#c6c6c6]', bgColor: 'bg-[#262626]', dotColor: 'bg-[#8d8d8d]' },
  processing: { label: 'Processing', color: 'text-[#0f62fe]', bgColor: 'bg-[#0f62fe]/10', dotColor: 'bg-[#0f62fe]', pulse: true },
  indexed: { label: 'Indexed', color: 'text-[#24a148]', bgColor: 'bg-[#24a148]/10', dotColor: 'bg-[#24a148]' },
  error: { label: 'Error', color: 'text-[#da1e28]', bgColor: 'bg-[#da1e28]/10', dotColor: 'bg-[#da1e28]' },
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const config = statusConfig[status] || statusConfig.pending

  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-[#393939] ${config.bgColor} ${config.color} text-[10px] font-bold uppercase tracking-wider`}>
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
