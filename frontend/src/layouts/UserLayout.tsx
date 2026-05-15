import type { ReactNode } from 'react'
import { Header } from '../components/Header'

interface UserLayoutProps {
  children: ReactNode
}

export const UserLayout = ({ children }: UserLayoutProps) => {
  return (
    <div className="relative min-h-screen flex flex-col bg-[#f4f4f4]">

      <Header />
      
      <main className="flex-1 pt-24 pb-12 px-4 md:px-6 relative z-10">
        <div className="max-w-4xl mx-auto h-[calc(100vh-100px)] flex flex-col">
          {children}
        </div>
      </main>
      
      
    </div>
  )
}
