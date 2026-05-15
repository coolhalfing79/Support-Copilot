import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Mail, Lock, ArrowRight, ShieldCheck, User as UserIcon } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

export const LoginPage = () => {
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login, register } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setSuccess('')
    
    try {
      if (isLogin) {
        await login(email, password)
        navigate('/')
      } else {
        await register(username, email, password, 'agent')
        setIsLogin(true) // Switch to login after successful registration
        setSuccess('Registration successful! Please login with your credentials.')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f4f4] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="bg-[#ffffff] p-10 rounded-[32px] border border-[#e0e0e0] shadow-md">
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-[#0f62fe] flex items-center justify-center shadow-sm mb-6">
              <Bot className="text-white w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold text-[#161616] tracking-tight">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p className="text-[#525252] text-sm mt-2 text-center">
              {isLogin ? 'Sign in to your Support Copilot account' : 'Join the next generation of L2 support'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[#da1e28] text-xs font-medium text-center"
              >
                {error}
              </motion.div>
            )}

            {success && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[#24a148] text-xs font-medium text-center"
              >
                {success}
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  key="username-field"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-2"
                >
                  <label className="text-[10px] uppercase tracking-widest font-bold text-[#525252] ml-1">Username</label>
                  <div className="relative group">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a8a8a8] group-focus-within:text-[#0f62fe] transition-colors" />
                    <input 
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="johndoe"
                      className="w-full bg-[#ffffff] border border-[#c6c6c6] rounded-2xl py-3.5 pl-12 pr-4 text-[#161616] text-sm outline-none focus:border-[#0f62fe] transition-all"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-bold text-[#525252] ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a8a8a8] group-focus-within:text-[#0f62fe] transition-colors" />
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-[#ffffff] border border-[#c6c6c6] rounded-2xl py-3.5 pl-12 pr-4 text-[#161616] text-sm outline-none focus:border-[#0f62fe] transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-bold text-[#525252] ml-1">Password</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a8a8a8] group-focus-within:text-[#0f62fe] transition-colors" />
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#ffffff] border border-[#c6c6c6] rounded-2xl py-3.5 pl-12 pr-4 text-[#161616] text-sm outline-none focus:border-[#0f62fe] transition-all"
                />
              </div>
            </div>


            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#0f62fe] hover:scale-[1.02] active:scale-[0.98] text-white font-bold py-4 rounded-2xl shadow-md shadow-[#0f62fe]/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:hover:scale-100"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isLogin ? 'SIGN IN' : 'CREATE ACCOUNT'}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => {
                setIsLogin(!isLogin)
                setError('')
                setSuccess('')
              }}
              className="text-xs text-[#0f62fe] hover:underline transition-all"
            >
              {isLogin ? "Don't have an account? Register" : "Already have an account? Sign in"}
            </button>
          </div>

          <div className="mt-8 pt-8 border-t border-[#e0e0e0] flex items-center justify-center gap-2 text-[#a8a8a8]">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-widest font-bold">Secure Enterprise Auth</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
