import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  color: string
  bgColor: string
}

export const StatCard = ({ title, value, icon: Icon, color, bgColor }: StatCardProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 rounded-2xl bg-[#262626] border border-[#393939] flex flex-col gap-4 group hover:bg-[#393939] transition-all"
    >
      <div className="flex items-center justify-between">
        <div className={`p-2.5 rounded-xl ${bgColor} flex items-center justify-center shadow-lg`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-[#8d8d8d] uppercase tracking-widest font-bold">Status</span>
          <span className="text-[10px] text-[#24a148] font-bold uppercase tracking-widest">Active</span>
        </div>
      </div>
      
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[#c6c6c6] text-xs font-medium uppercase tracking-wider">{title}</h3>
        <p className="text-3xl font-bold text-[#f4f4f4] tracking-tight">{value}</p>
      </div>

      <div className="h-1 w-full bg-[#393939] rounded-full overflow-hidden mt-2">
        <motion.div 
          initial={{ x: '-100%' }}
          animate={{ x: '0%' }}
          transition={{ duration: 1, delay: 0.5 }}
          className={`h-full w-2/3 rounded-full bg-gradient-to-r from-transparent to-${color.split('-')[1]}-500/50`}
        />
      </div>
    </motion.div>
  )
}
