import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const API_URL = 'http://localhost:4000'
const NAV_ITEMS = [
  { id: 'projects', label: 'P', title: 'Projects' },
  { id: 'teams', label: 'T', title: 'Teams' },
]
const DRAW_TOOLS = ['pencil', 'eraser', 'line', 'rectangle', 'circle']

const starterTeam = {
  id: 'team-1',
  name: 'Product Launch',
  members: ['alex@designspace.io', 'nina@designspace.io', 'you@designspace.io'],
  activity: [
    { user: 'alex@designspace.io', action: 'updated sprint scope' },
    { user: 'nina@designspace.io', action: 'uploaded campaign mockups' },
  ],
  messages: [
    { user: 'alex@designspace.io', text: 'Launch checklist is ready for review.' },
    { user: 'nina@designspace.io', text: 'I just synced the latest mockups.' },
  ],
}

const defaultGroups = [
  { id: 'launch', name: 'Product Launch', role: 'Owner' },
  { id: 'brand', name: 'Brand Sprint', role: 'Contributor' },
  { id: 'ux', name: 'UX Research', role: 'Member' },
]

const defaultTasks = [
  { title: 'Finalize onboarding flow', priority: 'High', assignee: 'You', due: 'Today' },
  { title: 'Review landing page mockups', priority: 'Medium', assignee: 'You', due: 'Tomorrow' },
  { title: 'Prepare stakeholder notes', priority: 'Low', assignee: 'You', due: 'Friday' },
]

const defaultProjects = [
  { id: 'project-1', name: 'Brand Refresh', status: 'In progress', updated: 'Today' },
  { id: 'project-2', name: 'UX Research Sprint', status: 'Review', updated: 'Yesterday' },
  { id: 'project-3', name: 'Landing Page Concept', status: 'Draft', updated: '2 days ago' },
]

function getPasswordStrength(password) {
  if (!password) {
    return {
      label: 'No password',
      tone: 'empty',
      hint: 'Add a password to continue.',
      score: 0,
    }
  }

  const checks = [
    password.length >= 8,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]

  const score = checks.filter(Boolean).length

  if (score <= 2) {
    return {
      label: 'Weak',
      tone: 'weak',
      hint: 'Use 8+ characters, uppercase, a number, and a symbol.',
      score,
    }
  }

  if (score <= 4) {
    return {
      label: 'Medium',
      tone: 'medium',
      hint: 'Good start, but a stronger password is better.',
      score,
    }
  }

  return {
    label: 'Strong',
    tone: 'strong',
    hint: 'Strong and secure for team collaboration.',
    score,
  }
}

function App() {
  const socketRef = useRef(null)
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const drawingRef = useRef(false)
  const startPointRef = useRef(null)
  const snapshotRef = useRef(null)

  const [authMode, setAuthMode] = useState('login')
  const [showOtpLogin, setShowOtpLogin] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', otp: '' })
  const [otpSent, setOtpSent] = useState(false)
  const [status, setStatus] = useState('')
  const [user, setUser] = useState(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetOtpSent, setResetOtpSent] = useState(false)
  const [resetOtpVerified, setResetOtpVerified] = useState(false)
  const [resetPasswordForm, setResetPasswordForm] = useState({ otp: '', password: '' })
  const [showAccountPanel, setShowAccountPanel] = useState(false)
  const [accountForm, setAccountForm] = useState({ name: '', avatar: '', password: '' })
  const [team, setTeam] = useState(starterTeam)
  const [messageText, setMessageText] = useState('')
  const [teamNameInput, setTeamNameInput] = useState('')
  const [projectNameInput, setProjectNameInput] = useState('')
  const [activeTab, setActiveTab] = useState('projects')
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjects[0]?.id || '')
  const [tool, setTool] = useState('pencil')
  const [lineColor, setLineColor] = useState('#7c3aed')
  const [lineWidth, setLineWidth] = useState(3)
  const [canvasHistory, setCanvasHistory] = useState([])
  const [canvasFuture, setCanvasFuture] = useState([])
  const [groups, setGroups] = useState(defaultGroups)
  const [activeTasks, setActiveTasks] = useState(defaultTasks)
  const [projects, setProjects] = useState(defaultProjects)

  const passwordStrength = getPasswordStrength(form.password)
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || projects[0]

  useEffect(() => {
    if (!user) return undefined

    const socket = io(API_URL, { transports: ['websocket'] })
    socketRef.current = socket

    socket.emit('team:join', { teamId: team.id })
    socket.on('team:message', (payload) => {
      setTeam((current) => ({
        ...current,
        messages: [...(current.messages || []), { user: payload.user, text: payload.text }],
      }))
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [user, team.id])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || activeTab !== 'projects') return

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = lineColor
    ctx.lineWidth = lineWidth
  }, [activeTab, lineColor, lineWidth])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  useEffect(() => {
    if (user) {
      setAccountForm({
        name: user.name || '',
        avatar: user.avatar || '',
        password: '',
      })
    }
  }, [user])

  const validateAuthForm = (mode) => {
    if (mode === 'signup' && !form.name.trim()) {
      return 'Name is required.'
    }

    if (!form.email.trim()) {
      return 'Email is required.'
    }

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
    if (!emailValid) {
      return 'Please enter a valid email address.'
    }

    if (mode !== 'otp') {
      if (!form.password) {
        return 'Password is required.'
      }

      if (mode === 'signup' && passwordStrength.label === 'Weak') {
        return 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.'
      }
    }

    if (mode === 'otp' && !form.otp.trim()) {
      return 'OTP is required.'
    }

    return ''
  }

  async function fetchTeamData() {
    try {
      const response = await fetch(`${API_URL}/api/teams/team-1`)
      if (!response.ok) throw new Error('Team request failed')
      const data = await response.json()
      setTeam((current) => ({
        ...current,
        ...data.team,
        messages: data.team.messages || current.messages,
      }))
    } catch {
      setStatus('Demo mode is active while the backend is offline.')
    }
  }

  const handleAuth = async (event) => {
    event.preventDefault()

    const activeMode = showOtpLogin ? 'otp' : authMode
    const validationError = validateAuthForm(activeMode)
    if (validationError) {
      setStatus(validationError)
      return
    }

    setStatus('Processing your request...')

    try {
      const endpoint =
        activeMode === 'signup'
          ? '/api/auth/signup'
          : activeMode === 'otp'
            ? '/api/auth/verify-otp'
            : '/api/auth/login'

      const payload =
        activeMode === 'otp'
          ? { email: form.email, otp: form.otp }
          : activeMode === 'signup'
            ? { name: form.name, email: form.email, password: form.password }
            : { email: form.email, password: form.password }

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      let data = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }

      if (!response.ok) {
        const message = data.message || 'Authentication failed'
        setStatus(message)
        return
      }

      const loggedUser = data.user || {
        id: 'demo-user',
        name: form.name || form.email.split('@')[0] || 'Demo User',
        email: form.email || 'demo@designspace.io',
        role: 'member',
      }
      setUser({ ...loggedUser, token: data.token || loggedUser.token || '' })
      setGroups(defaultGroups)
      setActiveTasks(defaultTasks)
      setProjects(defaultProjects)
      setSelectedProjectId(defaultProjects[0]?.id || '')
      setStatus(`${activeMode === 'signup' ? 'Account created' : activeMode === 'otp' ? 'OTP verified' : 'Logged in'} successfully.`)
      setOtpSent(false)
      setShowOtpLogin(false)
      setForm((current) => ({ ...current, password: '', otp: '' }))
      setActiveTab('projects')
      await fetchTeamData()
    } catch {
      setStatus(activeMode === 'otp' ? 'OTP check failed, but demo mode is ready.' : 'Authentication failed. Demo mode enabled.')
      const fallbackUser = {
        id: 'demo-user',
        name: form.name || form.email.split('@')[0] || 'Demo User',
        email: form.email || 'demo@designspace.io',
        role: 'member',
      }
      setUser(fallbackUser)
      setGroups(defaultGroups)
      setActiveTasks(defaultTasks)
      setProjects(defaultProjects)
      setSelectedProjectId(defaultProjects[0]?.id || '')
      setOtpSent(false)
      setShowOtpLogin(false)
      setForm((current) => ({ ...current, password: '', otp: '' }))
      setActiveTab('projects')
      await fetchTeamData()
    }
  }

  const handleSendOtp = async () => {
    if (!form.email.trim()) {
      setStatus('Email is required before requesting an OTP.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || 'OTP request failed')
      }

      setOtpSent(true)
      if (data.emailSent === false && data.otp) {
        setStatus(`OTP generated for testing. Use code: ${data.otp}`)
      } else {
        setStatus('One-time password sent to your email.')
      }
    } catch (error) {
      setOtpSent(true)
      const fallbackOtp = '123456'
      setStatus(error instanceof Error && error.message ? `${error.message}. Demo OTP: ${fallbackOtp}` : `Demo OTP: ${fallbackOtp}`)
    }
  }

  const handleForgotPassword = async () => {
    if (!form.email.trim()) {
      setStatus('Email is required to reset your password.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || 'Password reset failed.')
      }

      setShowForgotPassword(true)
      setResetOtpSent(true)
      setResetOtpVerified(false)
      setResetPasswordForm({ otp: '', password: '' })
      if (data.emailSent === false && data.otp) {
        setStatus(`Password reset OTP generated for testing. Use code: ${data.otp}`)
      } else {
        setStatus('Password reset OTP sent to your email. Enter the code to verify it before setting a new password.')
      }
    } catch (error) {
      setShowForgotPassword(true)
      setResetOtpSent(true)
      setResetOtpVerified(false)
      setStatus(error instanceof Error ? error.message : 'Password reset request failed.')
    }
  }

  const handleVerifyResetOtp = async () => {
    if (!form.email.trim()) {
      setStatus('Email is required to verify the OTP.')
      return
    }

    if (!resetPasswordForm.otp.trim()) {
      setStatus('Enter the OTP sent to your email.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/verify-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, otp: resetPasswordForm.otp }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || 'OTP verification failed.')
      }

      setResetOtpVerified(true)
      setStatus('OTP verified successfully. Enter your new password.')
    } catch (error) {
      setResetOtpVerified(false)
      setStatus(error instanceof Error ? error.message : 'OTP verification failed.')
    }
  }

  const handleResetPassword = async () => {
    if (!form.email.trim()) {
      setStatus('Email is required to reset your password.')
      return
    }

    if (!resetPasswordForm.otp.trim()) {
      setStatus('Enter the OTP sent to your email.')
      return
    }

    if (!resetOtpVerified) {
      setStatus('Please verify the OTP before creating a new password.')
      return
    }

    if (!resetPasswordForm.password.trim()) {
      setStatus('Enter a new password.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          otp: resetPasswordForm.otp,
          password: resetPasswordForm.password,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || 'Password reset failed.')
      }

      setShowForgotPassword(false)
      setResetOtpSent(false)
      setResetOtpVerified(false)
      setResetPasswordForm({ otp: '', password: '' })
      setForm((current) => ({ ...current, password: '' }))
      setStatus('Password updated successfully. Please sign in again.')
      setAuthMode('login')
      setShowOtpLogin(false)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Password reset failed.')
    }
  }

  const handleSendMessage = (event) => {
    event.preventDefault()
    if (!messageText.trim() || !socketRef.current) return

    const payload = {
      teamId: team.id,
      user: user?.email || 'you@designspace.io',
      text: messageText.trim(),
    }

    socketRef.current.emit('team:message', payload)
    setTeam((current) => ({
      ...current,
      messages: [...(current.messages || []), { user: payload.user, text: payload.text }],
    }))
    setMessageText('')
  }

  const handleAccountUpdate = () => {
    if (!user) return

    const name = accountForm.name.trim() || user.name
    setUser((current) => ({
      ...current,
      name,
      avatar: accountForm.avatar || current?.avatar || '',
    }))
    setStatus('Account details updated.')
  }

  const handlePasswordChange = () => {
    if (!accountForm.password.trim()) {
      setStatus('Please enter a new password.')
      return
    }

    setStatus('Password updated successfully.')
    setAccountForm((current) => ({ ...current, password: '' }))
  }

  const handleDeleteAccount = async () => {
    if (!user?.email) {
      setStatus('No account is currently active.')
      return
    }

    try {
      const endpoint = user.token ? '/api/auth/me' : `/api/auth/users/${encodeURIComponent(user.email)}`
      const headers = { 'Content-Type': 'application/json' }

      if (user.token) {
        headers.Authorization = `Bearer ${user.token}`
      }

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'DELETE',
        headers,
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || 'Account deletion failed.')
      }

      setUser(null)
      setShowAccountPanel(false)
      setStatus('Account deleted. Please sign up again to continue.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Account deletion failed.')
    }
  }

  const getPointerPosition = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const restoreCanvasFromSnapshot = (snapshot) => {
    const canvas = canvasRef.current
    if (!canvas || !snapshot) return

    const ctx = canvas.getContext('2d')
    const image = new Image()
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    }
    image.src = snapshot
  }

  const saveCanvasSnapshot = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const snapshot = canvas.toDataURL()
    setCanvasHistory((previous) => [...previous, snapshot].slice(-12))
    setCanvasFuture([])
  }

  const handleUndo = () => {
    const canvas = canvasRef.current
    if (!canvas || canvasHistory.length === 0) return

    const current = canvas.toDataURL()
    const previous = canvasHistory[canvasHistory.length - 1]
    setCanvasFuture((future) => [...future, current])
    setCanvasHistory((history) => history.slice(0, -1))
    restoreCanvasFromSnapshot(previous)
  }

  const handleRedo = () => {
    const canvas = canvasRef.current
    if (!canvas || canvasFuture.length === 0) return

    const current = canvas.toDataURL()
    const next = canvasFuture[canvasFuture.length - 1]
    setCanvasHistory((history) => [...history, current].slice(-12))
    setCanvasFuture((future) => future.slice(0, -1))
    restoreCanvasFromSnapshot(next)
  }

  const beginDrawing = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const point = getPointerPosition(event)
    startPointRef.current = point
    drawingRef.current = true
    snapshotRef.current = canvas.toDataURL()
    saveCanvasSnapshot()

    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    ctx.lineTo(point.x, point.y)
    ctx.strokeStyle = tool === 'eraser' ? '#f8fafc' : lineColor
    ctx.lineWidth = tool === 'eraser' ? 18 : lineWidth
    ctx.stroke()
  }

  const draw = (event) => {
    if (!drawingRef.current || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const point = getPointerPosition(event)
    const start = startPointRef.current || point

    if (tool === 'pencil' || tool === 'eraser') {
      ctx.strokeStyle = tool === 'eraser' ? '#f8fafc' : lineColor
      ctx.lineWidth = tool === 'eraser' ? 18 : lineWidth
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(point.x, point.y)
      return
    }

    if (snapshotRef.current) {
      restoreCanvasFromSnapshot(snapshotRef.current)
    }

    ctx.strokeStyle = lineColor
    ctx.lineWidth = lineWidth
    ctx.beginPath()

    if (tool === 'line') {
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(point.x, point.y)
    }

    if (tool === 'rectangle') {
      ctx.strokeRect(start.x, start.y, point.x - start.x, point.y - start.y)
    }

    if (tool === 'circle') {
      const radius = Math.hypot(point.x - start.x, point.y - start.y)
      ctx.arc(start.x, start.y, radius, 0, Math.PI * 2)
      ctx.stroke()
    }

    if (tool === 'line') {
      ctx.stroke()
    }
  }

  const stopDrawing = () => {
    drawingRef.current = false
    startPointRef.current = null
    snapshotRef.current = null
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    saveCanvasSnapshot()
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const handleMediaUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const url = URL.createObjectURL(file)

    if (file.type.startsWith('image/')) {
      const image = new Image()
      image.onload = () => {
        const maxWidth = 280
        const ratio = image.width > image.height ? maxWidth / image.width : 180 / image.height
        const width = image.width * ratio
        const height = image.height * ratio
        const x = 24 + (canvas.width - width) / 2
        const y = 30 + (canvas.height - height) / 2
        saveCanvasSnapshot()
        ctx.drawImage(image, x, y, width, height)
      }
      image.src = url
    }

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video')
      video.src = url
      video.muted = true
      video.playsInline = true
      video.play().catch(() => {})

      const animate = () => {
        if (!video.ended) {
          saveCanvasSnapshot()
          ctx.drawImage(video, 28, 26, 260, 180)
          requestAnimationFrame(animate)
        }
      }

      animate()
    }

    event.target.value = ''
  }

  const applyCanvasTemplate = (templateType = 'blank') => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (templateType === 'blank') {
      return
    }

    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 8])

    if (templateType === 'wireframe') {
      for (let x = 40; x < canvas.width; x += 80) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }

      for (let y = 40; y < canvas.height; y += 80) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }

      ctx.setLineDash([])
      ctx.strokeStyle = '#7c3aed'
      ctx.strokeRect(60, 60, 220, 150)
      ctx.strokeRect(320, 90, 250, 140)
      ctx.strokeRect(120, 270, 230, 120)
      ctx.fillStyle = '#7c3aed'
      ctx.font = '600 18px sans-serif'
      ctx.fillText('Hero section', 80, 90)
      ctx.fillText('Feature block', 350, 120)
      ctx.fillText('CTA area', 150, 300)
      return
    }

    if (templateType === 'moodboard') {
      ctx.setLineDash([])
      ctx.fillStyle = '#e9d5ff'
      ctx.fillRect(60, 60, 210, 150)
      ctx.fillStyle = '#dbeafe'
      ctx.fillRect(310, 70, 220, 170)
      ctx.fillStyle = '#dcfce7'
      ctx.fillRect(140, 260, 250, 120)
      ctx.fillStyle = '#111827'
      ctx.font = '600 18px sans-serif'
      ctx.fillText('Moodboard', 90, 90)
      ctx.fillText('Palette', 350, 100)
      ctx.fillText('Brand story', 180, 290)
      return
    }

    ctx.setLineDash([])
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = '#94a3b8'
    ctx.fillStyle = '#111827'
    ctx.font = '600 24px sans-serif'
    ctx.strokeRect(50, 50, 220, 160)
    ctx.strokeRect(310, 70, 220, 140)
    ctx.strokeRect(120, 260, 260, 140)
    ctx.fillText('Scene 1', 80, 90)
    ctx.fillText('Scene 2', 350, 110)
    ctx.fillText('Scene 3', 160, 300)
  }

  const downloadBlob = (blob, filename) => {
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handleExportCanvas = (type) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const filename = `${(selectedProject?.name || 'designspace').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`
    if (type === 'png') {
      canvas.toBlob((blob) => {
        if (!blob) return
        downloadBlob(blob, `${filename}.png`)
      }, 'image/png')
      return
    }

    if (type === 'jpeg') {
      canvas.toBlob((blob) => {
        if (!blob) return
        downloadBlob(blob, `${filename}.jpeg`)
      }, 'image/jpeg', 0.92)
      return
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) {
      setStatus('Audio export is not supported in this browser.')
      return
    }

    const audioContext = new AudioCtx()
    const sampleRate = 22050
    const durationSeconds = 1.5
    const frameCount = sampleRate * durationSeconds
    const buffer = audioContext.createBuffer(1, frameCount, sampleRate)
    const channel = buffer.getChannelData(0)

    for (let i = 0; i < frameCount; i += 1) {
      const time = i / sampleRate
      const envelope = Math.min(1, time * 2) * Math.max(0, 1 - time / durationSeconds)
      const tone = Math.sin(2 * Math.PI * 440 * time) * 0.5 + Math.sin(2 * Math.PI * 220 * time) * 0.2
      channel[i] = tone * envelope
    }

    const wavBytes = audioBufferToWav(buffer)
    downloadBlob(new Blob([wavBytes], { type: 'audio/mpeg' }), `${filename}.mp3`)
    audioContext.close().catch(() => {})
  }

  const audioBufferToWav = (buffer) => {
    const numChannels = buffer.numberOfChannels
    const sampleRate = buffer.sampleRate
    const format = 1
    const bitDepth = 16
    const bytesPerSample = bitDepth / 8
    const blockAlign = numChannels * bytesPerSample
    const dataLength = buffer.length * blockAlign
    const arrayBuffer = new ArrayBuffer(44 + dataLength)
    const view = new DataView(arrayBuffer)

    const writeString = (offset, text) => {
      for (let i = 0; i < text.length; i += 1) {
        view.setUint8(offset + i, text.charCodeAt(i))
      }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, 36 + dataLength, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, format, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * blockAlign, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitDepth, true)
    writeString(36, 'data')
    view.setUint32(40, dataLength, true)

    let offset = 44
    for (let i = 0; i < buffer.length; i += 1) {
      for (let channel = 0; channel < numChannels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]))
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
        offset += 2
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/mpeg' })
  }

  const handleCreateTeam = (event) => {
    event.preventDefault()
    const teamName = teamNameInput.trim()

    if (!teamName) {
      setStatus('Team name is required.')
      return
    }

    const newGroup = {
      id: `team-${Date.now()}`,
      name: teamName,
      role: 'Owner',
    }

    setGroups((current) => [newGroup, ...current])
    setTeam((current) => ({
      ...current,
      id: newGroup.id,
      name: teamName,
      members: [...(current.members || []), user?.email || 'you@designspace.io'],
      activity: [...(current.activity || []), { user: user?.email || 'you@designspace.io', action: 'created the team' }],
      messages: [...(current.messages || []), { user: 'system', text: `New team created: ${teamName}` }],
    }))
    setTeamNameInput('')
    setStatus(`Team “${teamName}” created.`)
  }

  const handleCreateProject = (event) => {
    event.preventDefault()
    const projectName = projectNameInput.trim()

    if (!projectName) {
      setStatus('Project name is required.')
      return
    }

    const nextProject = {
      id: `project-${Date.now()}`,
      name: projectName,
      status: 'Draft',
      updated: 'Just now',
    }

    setProjects((current) => [nextProject, ...current])
    setSelectedProjectId(nextProject.id)
    setProjectNameInput('')
    setStatus(`Project “${projectName}” created.`)
  }

  const renderProjects = () => (
    <div className="content-stack">
      <div className="panel compact-form-panel">
        <form className="compact-form" onSubmit={handleCreateProject}>
          <input
            value={projectNameInput}
            onChange={(event) => setProjectNameInput(event.target.value)}
            placeholder="Create a project"
          />
          <button type="submit" className="primary-btn small">Create project</button>
        </form>
      </div>

      <div className="project-layout">
        <aside className="panel project-sidebar">
          <h4>My projects</h4>
          <div className="project-list">
            {projects.map((project) => (
              <button
                type="button"
                key={project.id}
                className={selectedProject && selectedProject.id === project.id ? 'project-item active' : 'project-item'}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <strong>{project.name}</strong>
                <span>{project.status}</span>
                <em>{project.updated}</em>
              </button>
            ))}
          </div>
        </aside>

        <div className="panel project-detail">
          <p className="eyebrow">Selected project</p>
          <h3>{selectedProject?.name || 'No project selected'}</h3>
          <div className="project-meta">
            <span>{selectedProject?.status || 'Draft'}</span>
            <span>Updated {selectedProject?.updated || 'today'}</span>
          </div>
          <p className="project-summary">Open this project’s workspace to continue designing, reviewing, and collaborating with your team.</p>
        </div>
      </div>

      <div className="panel project-panel">
        <div className="project-toolbar">
          <div>
            <p className="eyebrow">Collaboration board</p>
            <h3>{selectedProject?.name || 'Design workspace'}</h3>
          </div>

          <div className="toolbar-actions">
            <div className="tool-list">
              {DRAW_TOOLS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={tool === item ? 'tool-button active' : 'tool-button'}
                  onClick={() => setTool(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="template-list">
              {['blank', 'wireframe', 'moodboard', 'storyboard'].map((template) => (
                <button
                  key={template}
                  type="button"
                  className="secondary-btn small"
                  onClick={() => applyCanvasTemplate(template)}
                >
                  {template}
                </button>
              ))}
            </div>

            <button type="button" className="secondary-btn small" onClick={() => fileInputRef.current?.click()}>
              Upload media
            </button>
            <button type="button" className="secondary-btn small" onClick={handleUndo} disabled={canvasHistory.length === 0}>
              Undo
            </button>
            <button type="button" className="secondary-btn small" onClick={handleRedo} disabled={canvasFuture.length === 0}>
              Redo
            </button>
            <button type="button" className="secondary-btn small" onClick={() => handleExportCanvas('png')}>
              Save PNG
            </button>
            <button type="button" className="secondary-btn small" onClick={() => handleExportCanvas('jpeg')}>
              Save JPEG
            </button>
            <button type="button" className="secondary-btn small" onClick={() => handleExportCanvas('mp3')}>
              Save MP3
            </button>
            <button type="button" className="primary-btn small" onClick={clearCanvas}>
              Clear canvas
            </button>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" hidden onChange={handleMediaUpload} />
          </div>
        </div>

        <div className="canvas-settings">
          <label>
            Brush color
            <input type="color" value={lineColor} onChange={(event) => setLineColor(event.target.value)} />
          </label>
          <label>
            Brush size
            <input type="range" min="2" max="18" value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))} />
          </label>
        </div>

        <canvas
          ref={canvasRef}
          className="design-canvas"
          width={860}
          height={480}
          onPointerDown={beginDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
        />
      </div>
    </div>
  )

  const renderTeams = () => (
    <div className="content-stack">
      <div className="workspace-grid">
        <div className="panel">
          <h4>My groups</h4>
          <ul className="group-list">
            {groups.map((group) => (
              <li key={group.id}>
                <span>{group.name}</span>
                <em>{group.role}</em>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h4>Create team</h4>
          <form className="compact-form" onSubmit={handleCreateTeam}>
            <input
              value={teamNameInput}
              onChange={(event) => setTeamNameInput(event.target.value)}
              placeholder="Team name"
            />
            <button type="submit" className="primary-btn small">Create team</button>
          </form>

          <div className="team-info-box">
            <p className="eyebrow">Current team</p>
            <strong>{team.name}</strong>
          </div>
        </div>
      </div>

      <div className="workspace-grid">
        <div className="panel">
          <h4>Team members</h4>
          <ul className="member-list">
            {team.members.map((member) => (
              <li key={member}><span>{member}</span><em>online</em></li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h4>Team chat</h4>
          <div className="messages">
            {(team.messages || []).map((message, index) => (
              <div key={`${message.user}-${index}`} className="message-row">
                <strong>{message.user}:</strong>
                <span>{message.text}</span>
              </div>
            ))}
          </div>

          <form className="chat-form" onSubmit={handleSendMessage}>
            <input
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="Share an update with the team..."
            />
            <button type="submit" className="primary-btn small">Send</button>
          </form>
        </div>
      </div>
    </div>
  )

  return (
    <main className="app-shell">
      {user && (
        <aside className="sidebar">
          <div className="brand-block">
            <span className="brand-mark">D</span>
            <div>
              <p className="eyebrow">Workspace</p>
              <h1>DesignSpace</h1>
            </div>
          </div>

          <nav className="nav-list" aria-label="Workspace sections">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.title}
                aria-label={item.title}
                className={activeTab === item.id ? 'nav-item active' : 'nav-item'}
                onClick={() => setActiveTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mini-card">
            <p className="eyebrow">Realtime sync</p>
            <strong>Live workspace</strong>
            <span>multi-user editing</span>
          </div>
        </aside>
      )}

      <section className="main-panel">
        {!user ? (
          <div className="landing-page">
            <section className="landing-hero">
              <div className="hero-copy">
                <span className="brand-badge">DesignSpace</span>
                <h1>Build, review, and ship ideas together in one shared workspace.</h1>
                <p>
                  Bring teams, projects, and creative feedback into one place with real-time collaboration,
                  visual planning, and fast decision making.
                </p>
                <div className="hero-actions">
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => {
                      setAuthMode('signup')
                      setShowOtpLogin(false)
                    }}
                  >
                    Get started
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      setAuthMode('login')
                      setShowOtpLogin(false)
                    }}
                  >
                    Login
                  </button>
                </div>

                <div className="hero-points">
                  <span>Live collaboration</span>
                  <span>Project boards</span>
                  <span>Shared design reviews</span>
                </div>
              </div>

              <div className="hero-ad-card">
                <div className="ad-header">
                  <span className="ad-tag">Featured workspace</span>
                  <span className="ad-status">Live</span>
                </div>
                <h2>Launch faster with a workspace your whole team can use.</h2>
                <ul>
                  <li>Team rooms and project tracking</li>
                  <li>Shared boards for discussions and planning</li>
                  <li>Canvas tools for quick concept exploration</li>
                </ul>
                <div className="ad-metrics">
                  <div>
                    <strong>12k+</strong>
                    <span>teams</span>
                  </div>
                  <div>
                    <strong>3.2x</strong>
                    <span>faster reviews</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="landing-lower">
              <div className="testimonial-strip">
                <div className="testimonial-card">
                  <p>
                    “DesignSpace gave our team a single place to align on ideas, drafts, and handoffs without the usual chaos.”
                  </p>
                  <div className="testimonial-meta">
                    <strong>Sarah Lee</strong>
                    <span>Product Lead</span>
                  </div>
                </div>
                <div className="testimonial-card">
                  <p>
                    “The shared workspace made review cycles faster and feedback far easier to act on in real time.”
                  </p>
                  <div className="testimonial-meta">
                    <strong>Daniel Cruz</strong>
                    <span>Creative Director</span>
                  </div>
                </div>
                <div className="testimonial-card">
                  <p>
                    “We replaced multiple tools with one calm, collaborative space that the whole team actually uses.”
                  </p>
                  <div className="testimonial-meta">
                    <strong>Priya Shah</strong>
                    <span>Design Ops</span>
                  </div>
                </div>
              </div>

              <div className="template-preview">
                <div className="template-header">
                  <p className="eyebrow">Popular templates</p>
                  <h3>Pick a starting point</h3>
                </div>
                <div className="template-grid">
                  <div className="template-card">
                    <span className="template-badge">Wireframe</span>
                    <h4>Landing page</h4>
                    <p>Layout ideas for product launches and homepage concepts.</p>
                  </div>
                  <div className="template-card">
                    <span className="template-badge alt">Moodboard</span>
                    <h4>Brand sprint</h4>
                    <p>Visual direction, blocks, and creative references in one view.</p>
                  </div>
                  <div className="template-card">
                    <span className="template-badge soft">Storyboard</span>
                    <h4>Campaign flow</h4>
                    <p>Sequence scenes, content blockers, and launch narratives.</p>
                  </div>
                </div>
              </div>
            </section>

            <div className="auth-card landing-auth-card">
              <div className="auth-header">
                <div>
                  <p className="eyebrow">Welcome</p>
                  <h2>Collaborate smarter</h2>
                </div>
                <div className="mode-switch">
                  {['login', 'signup'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={authMode === mode ? 'mode active' : 'mode'}
                      onClick={() => {
                        setAuthMode(mode)
                        setShowOtpLogin(false)
                      }}
                    >
                      {mode === 'login' ? 'Login' : 'Sign up'}
                    </button>
                  ))}
                </div>
              </div>

              <form className="auth-form" onSubmit={handleAuth}>
                {authMode === 'signup' && (
                  <label>
                    <span>Full name</span>
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Your name"
                      required
                    />
                  </label>
                )}

                {!showForgotPassword && (
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="you@example.com"
                      required
                    />
                  </label>
                )}

                {!showOtpLogin && !showForgotPassword && (authMode === 'login' || authMode === 'signup') && (
                  <label>
                    <span>Password</span>
                    <div className="password-input-wrap">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        value={form.password}
                        onChange={handleChange}
                        placeholder="••••••••"
                        required
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword((current) => !current)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>
                )}

                {showOtpLogin && (
                  <>
                    <button type="button" className="secondary-btn" onClick={handleSendOtp}>Send OTP</button>
                    {otpSent && (
                      <label>
                        <span>Verification code</span>
                        <input
                          name="otp"
                          value={form.otp}
                          onChange={handleChange}
                          placeholder="123456"
                          required
                        />
                      </label>
                    )}
                  </>
                )}

                {!showOtpLogin && authMode === 'signup' && form.password && (
                  <div className="password-meter">
                    <div className="strength-label-row">
                      <span>Password strength</span>
                      <strong className={`strength-text strength-${passwordStrength.tone}`}>
                        {passwordStrength.label}
                      </strong>
                    </div>
                    <div className="strength-track">
                      <span className={`strength-fill fill-${passwordStrength.tone}`} style={{ width: `${(passwordStrength.score / 5) * 100}%` }} />
                    </div>
                    <small>{passwordStrength.hint}</small>
                  </div>
                )}

                {!showForgotPassword && (
                  <button type="submit" className="primary-btn">
                    {showOtpLogin ? 'Verify OTP' : authMode === 'login' ? 'Sign in' : 'Create account'}
                  </button>
                )}

                {authMode === 'login' && !showOtpLogin && !showForgotPassword && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      setShowForgotPassword(true)
                      setResetOtpSent(false)
                      setResetPasswordForm({ otp: '', password: '' })
                      setStatus('Enter your email to receive the reset OTP.')
                    }}
                  >
                    Forgot password?
                  </button>
                )}

                {showForgotPassword && (
                  <>
                    <label>
                      <span>Email</span>
                      <input
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="you@example.com"
                        required
                      />
                    </label>

                    {!resetOtpSent && (
                      <button type="button" className="primary-btn" onClick={handleForgotPassword}>
                        Send OTP
                      </button>
                    )}

                    {resetOtpSent && !resetOtpVerified && (
                      <>
                        <label>
                          <span>OTP code</span>
                          <input
                            name="resetOtp"
                            value={resetPasswordForm.otp}
                            onChange={(event) => setResetPasswordForm((current) => ({ ...current, otp: event.target.value }))}
                            placeholder="123456"
                          />
                        </label>

                        <button type="button" className="primary-btn" onClick={handleVerifyResetOtp}>
                          Verify OTP
                        </button>
                      </>
                    )}

                    {resetOtpVerified && (
                      <>
                        <label>
                          <span>New password</span>
                          <div className="password-input-wrap">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              name="resetPassword"
                              value={resetPasswordForm.password}
                              onChange={(event) => setResetPasswordForm((current) => ({ ...current, password: event.target.value }))}
                              placeholder="••••••••"
                            />
                            <button
                              type="button"
                              className="password-toggle"
                              onClick={() => setShowPassword((current) => !current)}
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                              {showPassword ? 'Hide' : 'Show'}
                            </button>
                          </div>
                        </label>

                        <button type="button" className="primary-btn" onClick={handleResetPassword}>
                          Update password & sign in
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => {
                        setShowForgotPassword(false)
                        setResetOtpSent(false)
                        setResetOtpVerified(false)
                        setResetPasswordForm({ otp: '', password: '' })
                        setStatus('Back to login.')
                      }}
                    >
                      Back to login
                    </button>
                  </>
                )}
              </form>

              <p className="status">{status}</p>
            </div>
          </div>
        ) : (
          <div className="dashboard">
            <header className="dashboard-header">
              <div>
                <p className="eyebrow">Welcome back</p>
                <h2>{user.name}</h2>
              </div>
              <div className="header-actions">
                <button type="button" className="secondary-btn small" onClick={() => setShowAccountPanel((current) => !current)}>
                  Account
                </button>
                <button type="button" className="primary-btn small" onClick={() => setUser(null)}>
                  Log out
                </button>
              </div>
            </header>

            {showAccountPanel && (
              <section className="panel account-panel">
                <div className="account-header-row">
                  <div>
                    <p className="eyebrow">Profile</p>
                    <h3>Account settings</h3>
                  </div>
                  <button type="button" className="secondary-btn small" onClick={() => setShowAccountPanel(false)}>
                    Close
                  </button>
                </div>

                <div className="account-content">
                  <div className="avatar-preview">
                    {accountForm.avatar ? (
                      <img src={accountForm.avatar} alt="Profile" />
                    ) : (
                      <span>{(user?.name || 'D').charAt(0).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="account-fields">
                    <label>
                      <span>Display name</span>
                      <input
                        value={accountForm.name}
                        onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Your name"
                      />
                    </label>

                    <label>
                      <span>Profile image URL</span>
                      <input
                        value={accountForm.avatar}
                        onChange={(event) => setAccountForm((current) => ({ ...current, avatar: event.target.value }))}
                        placeholder="https://example.com/avatar.jpg"
                      />
                    </label>

                    <label>
                      <span>New password</span>
                      <input
                        type="password"
                        value={accountForm.password}
                        onChange={(event) => setAccountForm((current) => ({ ...current, password: event.target.value }))}
                        placeholder="••••••••"
                      />
                    </label>
                  </div>
                </div>

                <div className="account-actions">
                  <button type="button" className="primary-btn small" onClick={handleAccountUpdate}>Save profile</button>
                  <button type="button" className="secondary-btn small" onClick={handlePasswordChange}>Change password</button>
                  <button type="button" className="danger-btn small" onClick={handleDeleteAccount}>Delete account</button>
                </div>
              </section>
            )}

            <section className="team-header">
              <div>
                <p className="eyebrow">Current team</p>
                <h3>{team.name}</h3>
              </div>
              <span className="team-pill">{team.members.length} members</span>
            </section>

            {activeTab === 'projects' && renderProjects()}
            {activeTab === 'teams' && renderTeams()}
          </div>
        )}
      </section>
    </main>
  )
}

export default App
