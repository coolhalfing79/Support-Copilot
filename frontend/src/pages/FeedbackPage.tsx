import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Star, Send, CheckCircle2, AlertCircle, Bug, Lightbulb, MessageSquare } from 'lucide-react'
import apiClient from '../config/api'
import { useAuthStore } from '../store/authStore'
import { cn } from '../lib/utils'

export const FeedbackPage = () => {
  const { user } = useAuthStore()
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [category, setCategory] = useState('general')
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const categories = [
    { id: 'general', label: 'General Feedback', icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'bug', label: 'Report a Bug', icon: Bug, color: 'text-red-500', bg: 'bg-red-50' },
    { id: 'feature', label: 'Feature Request', icon: Lightbulb, color: 'text-amber-500', bg: 'bg-amber-50' },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating === 0) {
      setError("Please select a rating before submitting.")
      return
    }
    if (!comment.trim()) {
      setError("Please leave a short comment.")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await apiClient.post('/feedback', {
        rating,
        comment,
        category,
        user_id: user?.id
      })
      setIsSuccess(true)
      // Reset form after 3 seconds
      setTimeout(() => {
        setIsSuccess(false)
        setRating(0)
        setComment('')
        setCategory('general')
      }, 3000)
    } catch (err) {
      console.error("Feedback submission failed", err)
      setError("Something went wrong. Please try again later.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50/30 p-8 custom-scrollbar">
      <div className="max-w-2xl mx-auto">
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <MessageCircle className="text-white w-5 h-5" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Your Feedback</h1>
          </div>
          <p className="text-gray-600 text-[15px]">
            Help us shape the future of GraphMind AI. We value every insight and suggestion you share.
          </p>
        </header>

        <motion.div 
          layout
          className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden"
        >
          <AnimatePresence mode="wait">
            {isSuccess ? (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="p-12 flex flex-col items-center text-center"
              >
                <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h2>
                <p className="text-gray-500 max-w-xs">
                  Your feedback has been received and sent to our admin team for review.
                </p>
              </motion.div>
            ) : (
              <motion.form 
                key="form"
                onSubmit={handleSubmit}
                className="p-8 space-y-8"
              >
                {/* Rating Section */}
                <section>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 block">How was your experience?</label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        onClick={() => setRating(star)}
                        className="p-1 transition-transform active:scale-90"
                      >
                        <Star 
                          className={cn(
                            "w-10 h-10 transition-colors",
                            star <= (hoveredRating || rating) 
                              ? "fill-amber-400 text-amber-400" 
                              : "text-gray-200"
                          )} 
                        />
                      </button>
                    ))}
                    <span className="ml-4 text-sm font-semibold text-gray-400 italic">
                      {rating === 1 && "Poor"}
                      {rating === 2 && "Fair"}
                      {rating === 3 && "Good"}
                      {rating === 4 && "Great"}
                      {rating === 5 && "Excellent!"}
                    </span>
                  </div>
                </section>

                {/* Category Section */}
                <section>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 block">Feedback Category</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all text-center",
                          category === cat.id 
                            ? "bg-white border-indigo-600 shadow-md ring-4 ring-indigo-50" 
                            : "bg-gray-50 border-transparent hover:bg-white hover:border-gray-200"
                        )}
                      >
                        <cat.icon className={cn("w-5 h-5", cat.color)} />
                        <span className="text-xs font-bold text-gray-700">{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Comment Section */}
                <section>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 block">Tell us more</label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="What did you like? What can we improve? We're listening..."
                    className="w-full h-32 p-5 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all text-sm text-gray-700 resize-none"
                  />
                </section>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-xs font-medium"
                  >
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn(
                    "w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold text-[15px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-[0.98]",
                    isSubmitting && "opacity-70 cursor-not-allowed"
                  )}
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Submit Feedback
                      <Send className="w-4 h-4" />
                    </>
                  )}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        <p className="mt-8 text-center text-[11px] text-gray-400 font-medium leading-relaxed max-w-sm mx-auto">
          By submitting feedback, you help us build a better experience for everyone. We review every submission manually.
        </p>
      </div>
    </div>
  )
}
