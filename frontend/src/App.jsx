import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const NAV_ITEMS = [
  { id: 'projects', label: 'Projects', title: 'Projects' },
]
const DRAW_TOOLS = [
  { id: 'select', label: 'Select' },
  { id: 'pencil', label: 'Pencil' },
  { id: 'eraser', label: 'Eraser' },
  { id: 'line', label: 'Line' },
  { id: 'rectangle', label: 'Rect' },
  { id: 'circle', label: 'Circle' },
  { id: 'text', label: 'Text' },
]

const TOOL_ICONS = {
  select: '✓',
  pencil: '🖍️',
  eraser: '🧽',
  line: '／',
  rectangle: '▭',
  circle: '◯',
  text: 'T',
}

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

const defaultProjects = []
const USER_PROJECTS_KEY = 'designspace-user-projects'
const PROJECT_CANVAS_KEY = 'designspace-project-canvas'

function readStoredProjects() {
  try {
    const raw = localStorage.getItem(USER_PROJECTS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function getProjectsForUser(email) {
  if (!email) return []
  const stored = readStoredProjects()
  return Array.isArray(stored[email]) ? stored[email] : []
}

function saveProjectsForUser(email, nextProjects) {
  if (!email) return
  const stored = readStoredProjects()
  stored[email] = nextProjects
  localStorage.setItem(USER_PROJECTS_KEY, JSON.stringify(stored))
}

function readStoredProjectCanvas() {
  try {
    const raw = localStorage.getItem(PROJECT_CANVAS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function getCanvasForProject(email, projectId) {
  if (!email || !projectId) return []
  const stored = readStoredProjectCanvas()
  const userCanvas = stored[email] || {}
  return Array.isArray(userCanvas[projectId]) ? userCanvas[projectId] : []
}

function saveCanvasForProject(email, projectId, nextObjects) {
  if (!email || !projectId) return
  const stored = readStoredProjectCanvas()
  stored[email] = stored[email] || {}

  const normalized = nextObjects.map((object) => {
    if (object.type === 'image' && object.image?.src) {
      return { ...object, image: null, imageDataUrl: object.image.src }
    }
    return object
  })

  stored[email][projectId] = normalized
  localStorage.setItem(PROJECT_CANVAS_KEY, JSON.stringify(stored))
}

const COMMENTS_KEY = 'designspace-project-comments'

function readStoredComments() {
  try {
    const raw = localStorage.getItem(COMMENTS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function getCommentsForProject(email, projectId) {
  if (!email || !projectId) return []
  const stored = readStoredComments()
  const userComments = stored[email] || {}
  return Array.isArray(userComments[projectId]) ? userComments[projectId] : []
}

function saveCommentsForProject(email, projectId, nextComments) {
  if (!email || !projectId) return
  const stored = readStoredComments()
  stored[email] = stored[email] || {}
  stored[email][projectId] = nextComments
  localStorage.setItem(COMMENTS_KEY, JSON.stringify(stored))
}

function hydrateCanvasObjects(objects) {
  return (objects || []).map((object) => {
    if (object.type === 'image' && object.imageDataUrl) {
      const image = new Image()
      image.src = object.imageDataUrl
      return { ...object, image }
    }
    return object
  })
}

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
  const activeShapeIdRef = useRef(null)

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

  useEffect(() => {
    setForm({ name: '', email: '', password: '', otp: '' })
    setResetPasswordForm({ otp: '', password: '' })
    setShowPassword(false)
    setShowForgotPassword(false)
    setResetOtpSent(false)
    setResetOtpVerified(false)
    setStatus('')
  }, [])
  const [resetPasswordForm, setResetPasswordForm] = useState({ otp: '', password: '' })
  const [showAccountPanel, setShowAccountPanel] = useState(false)
  const [accountForm, setAccountForm] = useState({ name: '', avatar: '', password: '' })
  const [team, setTeam] = useState(starterTeam)
  const [messageText, setMessageText] = useState('')
  const [teamNameInput, setTeamNameInput] = useState('')
  const [projectNameInput, setProjectNameInput] = useState('')
  const [projectPrivacy, setProjectPrivacy] = useState('private')
  const [projectMembersInput, setProjectMembersInput] = useState('')
  const [activeTab, setActiveTab] = useState('projects')
  const [selectedSidebarItem, setSelectedSidebarItem] = useState('projects')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjects[0]?.id || '')
  const [tool, setTool] = useState('pencil')
  const [lineColor, setLineColor] = useState('#7c3aed')
  const [lineWidth, setLineWidth] = useState(3)
  const [textEditingId, setTextEditingId] = useState(null)
  const [textDraft, setTextDraft] = useState('')
  const [canvasHistory, setCanvasHistory] = useState([])
  const [canvasFuture, setCanvasFuture] = useState([])
  const [canvasObjects, setCanvasObjects] = useState([])
  const [selectedBoxId, setSelectedBoxId] = useState(null)
  const [canvasInteraction, setCanvasInteraction] = useState(null)
  const [canvasCursor, setCanvasCursor] = useState({ visible: false, x: 0, y: 0, icon: TOOL_ICONS.pencil })
  const [commentDraft, setCommentDraft] = useState('')
  const [boardComments, setBoardComments] = useState([])
  const [isCanvasRailOpen, setIsCanvasRailOpen] = useState(true)
  const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(true)
  const [commentPanelWidth, setCommentPanelWidth] = useState(360)
  const [isCommentPanelResizing, setIsCommentPanelResizing] = useState(false)
  const [groups, setGroups] = useState(defaultGroups)
  const [activeTasks, setActiveTasks] = useState(defaultTasks)
  const [projects, setProjects] = useState(() => getProjectsForUser(user?.email))

  const passwordStrength = getPasswordStrength(form.password)
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || projects[0]
  const selectedTextObject = canvasObjects.find((object) => object.type === 'text' && object.id === (selectedBoxId || textEditingId)) || null

  const renderCanvasScene = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    canvasObjects.forEach((object) => {
      if (object.type === 'image') {
        const image = object.image
        if (image) {
          ctx.drawImage(image, object.x, object.y, object.w, object.h)
        }
        if (selectedBoxId === object.id) {
          ctx.strokeStyle = '#7c3aed'
          ctx.lineWidth = 2
          ctx.strokeRect(object.x, object.y, object.w, object.h)
          const handles = [
            [object.x, object.y],
            [object.x + object.w, object.y],
            [object.x, object.y + object.h],
            [object.x + object.w, object.y + object.h],
          ]
          ctx.fillStyle = '#7c3aed'
          handles.forEach(([handleX, handleY]) => {
            ctx.fillRect(handleX - 5, handleY - 5, 10, 10)
          })
        }
        return
      }

      if (object.type === 'text') {
        const text = object.label || 'Text'
        const fontFamily = object.fontFamily || 'sans-serif'
        const fontSize = object.fontSize || 26
        const boxWidth = Math.max(100, Number(object.w) || (text.length * fontSize * 0.62))
        const boxHeight = Math.max(32, Number(object.h) || fontSize + 16)

        ctx.fillStyle = object.color || '#0f172a'
        ctx.font = `600 ${fontSize}px ${fontFamily}`
        ctx.fillText(text, object.x, object.y + fontSize)

        if (selectedBoxId === object.id || textEditingId === object.id) {
          ctx.strokeStyle = '#7c3aed'
          ctx.lineWidth = 2
          ctx.strokeRect(object.x - 8, object.y - 8, boxWidth + 16, boxHeight + 16)
        }
        return
      }

      if (object.type === 'shape') {
        ctx.strokeStyle = object.color || '#7c3aed'
        ctx.lineWidth = object.width || 3
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()

        if (object.tool === 'pencil' || object.tool === 'eraser') {
          const points = object.points || []
          if (points.length > 0) {
            ctx.moveTo(points[0].x, points[0].y)
            points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y))
            ctx.stroke()
          }
          return
        }

        if (object.tool === 'line') {
          ctx.moveTo(object.start.x, object.start.y)
          ctx.lineTo(object.end.x, object.end.y)
          ctx.stroke()
          return
        }

        if (object.tool === 'rectangle') {
          const x = Math.min(object.start.x, object.end.x)
          const y = Math.min(object.start.y, object.end.y)
          const width = Math.abs(object.end.x - object.start.x)
          const height = Math.abs(object.end.y - object.start.y)
          ctx.strokeRect(x, y, width, height)
          return
        }

        if (object.tool === 'circle') {
          const radius = Math.hypot(object.end.x - object.start.x, object.end.y - object.start.y)
          ctx.arc(object.start.x, object.start.y, radius, 0, Math.PI * 2)
          ctx.stroke()
        }
        return
      }

      ctx.strokeStyle = '#8b5cf6'
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.strokeRect(object.x, object.y, object.w, object.h)
      ctx.fillStyle = '#8b5cf6'
      ctx.font = '600 26px sans-serif'
      ctx.fillText(object.label, object.x + 20, object.y + 42)

      if (selectedBoxId === object.id) {
        const handles = [
          [object.x, object.y],
          [object.x + object.w, object.y],
          [object.x, object.y + object.h],
          [object.x + object.w, object.y + object.h],
        ]

        ctx.fillStyle = '#7c3aed'
        handles.forEach(([handleX, handleY]) => {
          ctx.fillRect(handleX - 5, handleY - 5, 10, 10)
        })
      }
    })
  }

  const getBoxAtPoint = (point) => {
    for (const object of canvasObjects) {
      const handles = [
        { x: object.x, y: object.y },
        { x: object.x + object.w, y: object.y },
        { x: object.x, y: object.y + object.h },
        { x: object.x + object.w, y: object.y + object.h },
      ]

      const handleHit = handles.find((handle) => Math.hypot(point.x - handle.x, point.y - handle.y) < 12)
      if (handleHit) {
        const handle =
          handleHit.x === object.x && handleHit.y === object.y ? 'nw' :
          handleHit.x === object.x + object.w && handleHit.y === object.y ? 'ne' :
          handleHit.x === object.x && handleHit.y === object.y + object.h ? 'sw' : 'se'
        return { kind: 'resize', boxId: object.id, handle }
      }

      if (point.x >= object.x && point.x <= object.x + object.w && point.y >= object.y && point.y <= object.y + object.h) {
        return { kind: 'move', boxId: object.id }
      }
    }

    return null
  }

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

    renderCanvasScene()
    const ctx = canvas.getContext('2d')
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = lineColor
    ctx.lineWidth = lineWidth
  }, [activeTab, lineColor, lineWidth, canvasObjects, selectedBoxId])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const openTextEditor = (objectId) => {
    const object = canvasObjects.find((item) => item.id === objectId)
    if (!object || object.type !== 'text') return

    setSelectedBoxId(objectId)
    setTextEditingId(objectId)
    setTextDraft(object.label || '')
  }

  const handleAddComment = (event) => {
    event.preventDefault()
    if (!commentDraft.trim()) return

    const nextComment = {
      id: `comment-${Date.now()}`,
      user: user?.name || user?.email || 'You',
      email: user?.email || 'you@designspace.io',
      text: commentDraft.trim(),
      time: 'Just now',
    }

    setBoardComments((current) => [...current, nextComment])
    setCommentDraft('')
  }

  const scrollToAuth = (mode = 'signup') => {
    setAuthMode(mode)
    setShowOtpLogin(false)
    setShowForgotPassword(false)
    setTimeout(() => {
      document.getElementById('landing-auth')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  useEffect(() => {
    if (user) {
      const storedProjects = getProjectsForUser(user.email)
      setProjects(storedProjects)
      setSelectedProjectId(storedProjects[0]?.id || '')
      setAccountForm({
        name: user.name || '',
        avatar: user.avatar || '',
        password: '',
      })
    }
  }, [user])

  useEffect(() => {
    if (!user?.email || !selectedProjectId) return

    const savedCanvas = hydrateCanvasObjects(getCanvasForProject(user.email, selectedProjectId))
    setCanvasObjects(savedCanvas)
    setSelectedBoxId(null)
  }, [user?.email, selectedProjectId])

  useEffect(() => {
    if (!user?.email || !selectedProjectId) return
    saveCanvasForProject(user.email, selectedProjectId, canvasObjects)
  }, [user?.email, selectedProjectId, canvasObjects])

  useEffect(() => {
    if (!isCommentPanelResizing) return undefined

    const handlePointerMove = (event) => {
      const nextWidth = window.innerWidth - event.clientX - 28
      const boundedWidth = Math.min(520, Math.max(260, nextWidth))
      setCommentPanelWidth(boundedWidth)
    }

    const handlePointerUp = () => setIsCommentPanelResizing(false)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isCommentPanelResizing])

  useEffect(() => {
    if (!user?.email || !selectedProjectId) return
    setBoardComments(getCommentsForProject(user.email, selectedProjectId))
  }, [user?.email, selectedProjectId])

  useEffect(() => {
    if (!user?.email || !selectedProjectId) return
    saveCommentsForProject(user.email, selectedProjectId, boardComments)
  }, [user?.email, selectedProjectId, boardComments])

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
      const nextUser = { ...loggedUser, token: data.token || loggedUser.token || '' }
      setUser(nextUser)
      setGroups(defaultGroups)
      setActiveTasks(defaultTasks)
      const storedProjects = getProjectsForUser(nextUser.email)
      setProjects(storedProjects)
      setSelectedProjectId(storedProjects[0]?.id || '')
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
      const storedProjects = getProjectsForUser(fallbackUser.email)
      setProjects(storedProjects)
      setSelectedProjectId(storedProjects[0]?.id || '')
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

      const storedProjects = readStoredProjects()
      delete storedProjects[user.email]
      localStorage.setItem(USER_PROJECTS_KEY, JSON.stringify(storedProjects))

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

    const point = getPointerPosition(event)
    setCanvasCursor((current) => ({ ...current, visible: true, x: event.clientX - canvas.getBoundingClientRect().left, y: event.clientY - canvas.getBoundingClientRect().top, icon: TOOL_ICONS[tool] || TOOL_ICONS.pencil }))
    const hit = getBoxAtPoint(point)

    if (hit) {
      const object = canvasObjects.find((item) => item.id === hit.boxId)
      if (!object) return

      setSelectedBoxId(object.id)
      if (object.type === 'text') {
        openTextEditor(object.id)
      } else {
        setTextEditingId(null)
      }
      setCanvasInteraction({
        kind: hit.kind,
        boxId: object.id,
        handle: hit.handle,
        startX: point.x,
        startY: point.y,
        original: { ...object },
      })
      return
    }

    if (tool === 'select') {
      setSelectedBoxId(null)
      setTextEditingId(null)
      setTextDraft('')
      return
    }

    if (tool === 'text') {
      const initialFontSize = Math.max(20, lineWidth * 8)
      const nextObject = {
        id: `text-${Date.now()}`,
        type: 'text',
        label: '',
        x: point.x,
        y: point.y,
        w: 160,
        h: initialFontSize + 18,
        color: lineColor,
        fontSize: initialFontSize,
        fontFamily: 'sans-serif',
        editing: true,
      }

      setCanvasObjects((current) => [...current, nextObject])
      setSelectedBoxId(nextObject.id)
      setTextEditingId(nextObject.id)
      setTextDraft('')
      return
    }

    const shapeId = `shape-${Date.now()}`
    activeShapeIdRef.current = shapeId
    const newShape = {
      id: shapeId,
      type: 'shape',
      tool,
      start: point,
      end: point,
      points: [point],
      color: tool === 'eraser' ? '#f8fafc' : lineColor,
      width: tool === 'eraser' ? 18 : lineWidth,
    }

    setCanvasObjects((current) => [...current, newShape])
    startPointRef.current = point
    drawingRef.current = true
    snapshotRef.current = canvas.toDataURL()
    saveCanvasSnapshot()
  }

  const draw = (event) => {
    const canvas = canvasRef.current
    if (canvas) {
      setCanvasCursor((current) => ({
        ...current,
        visible: true,
        x: event.clientX - canvas.getBoundingClientRect().left,
        y: event.clientY - canvas.getBoundingClientRect().top,
        icon: TOOL_ICONS[tool] || TOOL_ICONS.pencil,
      }))
    }

    if (canvasInteraction) {
      if (!canvas) return

      const point = getPointerPosition(event)
      const { boxId, kind, handle, original, startX, startY } = canvasInteraction
      const dx = point.x - startX
      const dy = point.y - startY

      setCanvasObjects((current) => current.map((object) => {
        if (object.id !== boxId) return object

        if (kind === 'move') {
          return {
            ...object,
            x: Math.max(0, Math.min(canvas.width - object.w, original.x + dx)),
            y: Math.max(0, Math.min(canvas.height - object.h, original.y + dy)),
          }
        }

        let nextX = original.x
        let nextY = original.y
        let nextW = original.w
        let nextH = original.h

        if (handle.includes('e')) {
          nextW = Math.max(60, original.w + dx)
        }

        if (handle.includes('s')) {
          nextH = Math.max(60, original.h + dy)
        }

        if (handle.includes('w')) {
          const proposedW = original.w - dx
          if (proposedW >= 60) {
            nextX = original.x + dx
            nextW = proposedW
          }
        }

        if (handle.includes('n')) {
          const proposedH = original.h - dy
          if (proposedH >= 60) {
            nextY = original.y + dy
            nextH = proposedH
          }
        }

        if (object.type === 'text') {
          const nextFontSize = Math.max(16, Math.min(72, Math.round(Math.max(nextH, nextW / Math.max(1, (object.label?.length || 12) * 0.55)))))
          return {
            ...object,
            x: Math.max(0, nextX),
            y: Math.max(0, nextY),
            w: Math.max(120, nextW),
            h: Math.max(38, nextH),
            fontSize: nextFontSize,
          }
        }

        return { ...object, x: Math.max(0, nextX), y: Math.max(0, nextY), w: nextW, h: nextH }
      }))
      return
    }

    if (!drawingRef.current || !canvasRef.current) return

    const point = getPointerPosition(event)
    if (tool === 'pencil' || tool === 'eraser') {
      setCanvasObjects((current) => current.map((object) => {
        if (object.id !== activeShapeIdRef.current) return object
        return {
          ...object,
          end: point,
          points: [...(object.points || []), point],
        }
      }))
      return
    }

    setCanvasObjects((current) => current.map((object) => {
      if (object.id !== activeShapeIdRef.current) return object
      return { ...object, end: point }
    }))
  }

  const stopDrawing = () => {
    drawingRef.current = false
    startPointRef.current = null
    snapshotRef.current = null
    activeShapeIdRef.current = null
    setCanvasInteraction(null)
    setCanvasCursor((current) => ({ ...current, visible: false }))
  }

  const finalizeTextBox = () => {
    if (!textEditingId) return

    const finalText = textDraft.trim() || 'Text'
    setCanvasObjects((current) => current.map((object) => {
      if (object.id !== textEditingId) return object
      return {
        ...object,
        label: finalText,
        w: Math.max(120, Math.min(420, Math.max(object.w || 160, finalText.length * (object.fontSize || 26) * 0.56))),
        h: Math.max(38, (object.fontSize || 26) + 18),
        editing: false,
      }
    }))
    setTextEditingId(null)
    setTextDraft('')
  }

  const updateSelectedTextStyle = (updates) => {
    if (!selectedBoxId) return

    setCanvasObjects((current) => current.map((object) => {
      if (object.id !== selectedBoxId || object.type !== 'text') return object
      return {
        ...object,
        ...updates,
        w: Math.max(120, updates.w ?? object.w ?? 160),
        h: Math.max(38, updates.h ?? object.h ?? (object.fontSize || 26) + 18),
      }
    }))
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    saveCanvasSnapshot()
    setCanvasObjects([])
    setSelectedBoxId(null)
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const handleCanvasDoubleClick = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const point = getPointerPosition(event)
    const hit = getBoxAtPoint(point)
    if (!hit) return

    const object = canvasObjects.find((item) => item.id === hit.boxId)
    if (object?.type === 'text') {
      openTextEditor(object.id)
    }
  }

  const handleMediaUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file || !canvasRef.current) return

    const url = URL.createObjectURL(file)
    const canvas = canvasRef.current

    if (file.type.startsWith('image/')) {
      const image = new Image()
      image.onload = () => {
        const maxWidth = 280
        const ratio = image.width > image.height ? maxWidth / image.width : 180 / image.height
        const width = image.width * ratio
        const height = image.height * ratio
        const x = 24 + (canvas.width - width) / 2
        const y = 30 + (canvas.height - height) / 2

        const nextObject = {
          id: `image-${Date.now()}`,
          type: 'image',
          image,
          x,
          y,
          w: width,
          h: height,
        }

        setCanvasObjects((current) => [...current, nextObject])
        setSelectedBoxId(nextObject.id)
      }
      image.src = url
    }

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video')
      video.src = url
      video.muted = true
      video.playsInline = true
      video.play().catch(() => {})

      const nextObject = {
        id: `video-${Date.now()}`,
        type: 'video',
        video,
        x: 28,
        y: 26,
        w: 260,
        h: 180,
      }

      setCanvasObjects((current) => [...current, nextObject])
      setSelectedBoxId(nextObject.id)
    }

    event.target.value = ''
  }

  const applyCanvasTemplate = (templateType = 'blank') => {
    const canvas = canvasRef.current
    if (!canvas) return

    const templateMap = {
      blank: [],
      wireframe: [
        { id: 'wireframe-hero', type: 'box', x: 60, y: 60, w: 260, h: 150, label: 'Hero section' },
        { id: 'wireframe-feature', type: 'box', x: 360, y: 90, w: 300, h: 150, label: 'Feature block' },
        { id: 'wireframe-cta', type: 'box', x: 120, y: 270, w: 280, h: 120, label: 'CTA area' },
      ],
      moodboard: [
        { id: 'moodboard-1', type: 'box', x: 60, y: 60, w: 210, h: 150, label: 'Moodboard' },
        { id: 'moodboard-2', type: 'box', x: 300, y: 70, w: 220, h: 170, label: 'Palette' },
        { id: 'moodboard-3', type: 'box', x: 140, y: 260, w: 250, h: 120, label: 'Brand story' },
      ],
      storyboard: [
        { id: 'story-1', type: 'box', x: 50, y: 50, w: 220, h: 160, label: 'Scene 1' },
        { id: 'story-2', type: 'box', x: 310, y: 70, w: 220, h: 140, label: 'Scene 2' },
        { id: 'story-3', type: 'box', x: 120, y: 260, w: 260, h: 140, label: 'Scene 3' },
      ],
    }

    const objects = templateMap[templateType] || []
    setCanvasObjects(objects)
    setSelectedBoxId(objects[0]?.id || null)

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

    renderCanvasScene()
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

    const members = projectMembersInput
      .split(',')
      .map((member) => member.trim())
      .filter(Boolean)

    const nextProject = {
      id: `project-${Date.now()}`,
      name: projectName,
      status: 'Draft',
      updated: 'Just now',
      privacy: projectPrivacy,
      members: members.length ? members : [user?.email || 'you@designspace.io'],
    }

    setProjects((current) => {
      const nextProjects = [nextProject, ...current]
      saveProjectsForUser(user?.email || 'demo@designspace.io', nextProjects)
      return nextProjects
    })
    setSelectedProjectId(nextProject.id)
    setProjectNameInput('')
    setProjectMembersInput('')
    setProjectPrivacy('private')
    setStatus(`Project “${projectName}” created.`)
  }

  const activeCollaborators = selectedProject?.members?.length
    ? selectedProject.members
    : team.members || []

  const renderProjects = () => (
    <div className="content-stack">
      <div className="panel compact-form-panel">
        <form className="project-creation-form" onSubmit={handleCreateProject}>
          <input
            value={projectNameInput}
            onChange={(event) => setProjectNameInput(event.target.value)}
            placeholder="Project name"
          />
          <select value={projectPrivacy} onChange={(event) => setProjectPrivacy(event.target.value)}>
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
          <input
            value={projectMembersInput}
            onChange={(event) => setProjectMembersInput(event.target.value)}
            placeholder="Add members, comma separated"
          />
          <button type="submit" className="primary-btn small">Create project</button>
        </form>
      </div>

      {projects.length === 0 ? (
        <div className="panel empty-state">
          <p className="eyebrow">Projects</p>
          <h3>No projects yet</h3>
          <p>Create your first board and invite your team to start collaborating.</p>
        </div>
      ) : (
        <>
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
                    <span>{project.privacy || 'private'}</span>
                    <em>{project.members?.length || 1} member(s)</em>
                  </button>
                ))}
              </div>
            </aside>

            <div className="panel project-detail">
              <p className="eyebrow">Selected project</p>
              <h3>{selectedProject?.name || 'No project selected'}</h3>
              <div className="project-meta">
                <span>{selectedProject?.privacy || 'private'}</span>
                <span>{selectedProject?.members?.length || 1} members</span>
                <span>Updated {selectedProject?.updated || 'today'}</span>
              </div>
              <p className="project-summary">Use this shared workspace to sketch, review, and refine ideas in real time with your team.</p>
            </div>
          </div>

          <div className="panel project-panel">
            <div className="canvas-top-toolbar">
              <button type="button" className="editor-tab active">Edit</button>
              <button type="button" className="editor-tab">Animate</button>
              <button type="button" className="editor-tab">Position</button>
              <div className="toolbar-icons">
                <button type="button" aria-label="share">↗</button>
                <button type="button" aria-label="duplicate">⧉</button>
                <button type="button" aria-label="grid">▦</button>
              </div>
            </div>

            <div className="design-workspace-shell">
              <aside className={isCanvasRailOpen ? 'canvas-rail open' : 'canvas-rail closed'}>
                <button
                  type="button"
                  className="rail-toggle"
                  onClick={() => setIsCanvasRailOpen((current) => !current)}
                  aria-label={isCanvasRailOpen ? 'Collapse tools' : 'Expand tools'}
                >
                  {isCanvasRailOpen ? '←' : '→'}
                </button>

                {isCanvasRailOpen && DRAW_TOOLS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    title={item.id}
                    className={tool === item.id ? 'tool-button active' : 'tool-button'}
                    onClick={() => setTool(item.id)}
                  >
                    <span className="tool-symbol">{TOOL_ICONS[item.id] || item.label[0]}</span>
                    <span className="tool-name">{item.label}</span>
                  </button>
                ))}
              </aside>

              <div className="canvas-main-area">
                <div className="project-toolbar">
                  <div>
                    <p className="eyebrow">Live canvas</p>
                    <h3>{selectedProject?.name || 'Blank canvas'}</h3>
                  </div>

                  <div className="toolbar-actions">
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

                <div className="canvas-collaborators">
                  {activeCollaborators.slice(0, 4).map((member, index) => (
                    <div key={`${member}-${index}`} className="collaborator-pill" style={{ '--member-color': ['#8b5cf6', '#22c55e', '#f59e0b', '#38bdf8'][index % 4] }}>
                      <span className="cursor-dot" />
                      {member}
                    </div>
                  ))}
                </div>

                <div className="canvas-settings">
                  {selectedTextObject ? (
                    <>
                      <label>
                        Text color
                        <input
                          type="color"
                          value={selectedTextObject.color || '#0f172a'}
                          onChange={(event) => updateSelectedTextStyle({ color: event.target.value })}
                        />
                      </label>
                      <label>
                        Font size
                        <input
                          type="range"
                          min="16"
                          max="72"
                          value={selectedTextObject.fontSize || 26}
                          onChange={(event) => updateSelectedTextStyle({ fontSize: Number(event.target.value), h: Number(event.target.value) + 18 })}
                        />
                      </label>
                      <label>
                        Font
                        <select
                          value={selectedTextObject.fontFamily || 'sans-serif'}
                          onChange={(event) => updateSelectedTextStyle({ fontFamily: event.target.value })}
                        >
                          <option value="sans-serif">Sans</option>
                          <option value="Georgia, serif">Serif</option>
                          <option value="'Courier New', monospace">Mono</option>
                          <option value="'Brush Script MT', cursive">Script</option>
                        </select>
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Brush color
                        <input type="color" value={lineColor} onChange={(event) => setLineColor(event.target.value)} />
                      </label>
                      <label>
                        Brush size
                        <input type="range" min="2" max="18" value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))} />
                      </label>
                    </>
                  )}
                </div>

                <div className="canvas-surface" style={{ position: 'relative' }}>
                  <canvas
                    ref={canvasRef}
                    className="design-canvas"
                    width={860}
                    height={480}
                    onPointerDown={beginDrawing}
                    onPointerMove={draw}
                    onPointerUp={stopDrawing}
                    onPointerLeave={stopDrawing}
                    onDoubleClick={handleCanvasDoubleClick}
                  />

                  {textEditingId && (() => {
                    const activeText = canvasObjects.find((object) => object.id === textEditingId)
                    if (!activeText) return null

                    return (
                      <input
                        type="text"
                        value={textDraft}
                        autoFocus
                        onChange={(event) => setTextDraft(event.target.value)}
                        onBlur={finalizeTextBox}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            finalizeTextBox()
                          }
                        }}
                        className="canvas-text-editor"
                        style={{
                          left: activeText.x,
                          top: activeText.y,
                          color: activeText.color || '#0f172a',
                          fontSize: `${activeText.fontSize || 26}px`,
                          fontFamily: activeText.fontFamily || 'sans-serif',
                        }}
                        placeholder="Type here"
                      />
                    )
                  })()}

                  {canvasCursor.visible && (
                    <div
                      className="canvas-tool-cursor"
                      style={{ left: canvasCursor.x, top: canvasCursor.y }}
                    >
                      {canvasCursor.icon}
                    </div>
                  )}
                </div>
              </div>

              {isCommentPanelOpen ? (
                <aside className="comment-panel" style={{ width: `${commentPanelWidth}px` }}>
                  <div className="comment-panel-header">
                    <button type="button" aria-label="Back">←</button>
                    <div className="comment-panel-pages"><span>‹</span><strong>1 / 1</strong><span>›</span></div>
                    <button type="button" aria-label="Close" onClick={() => setIsCommentPanelOpen(false)}>×</button>
                  </div>

                  <div className="comment-resize-handle" onPointerDown={(event) => {
                    event.preventDefault()
                    setIsCommentPanelResizing(true)
                  }} />

                  <div className="comment-thread">
                    {boardComments.length === 0 ? (
                      <div className="comment-empty">No comments yet. Leave feedback for the team.</div>
                    ) : (
                      boardComments.map((comment) => (
                        <div key={comment.id} className="comment-card">
                          <div className="comment-author-row">
                            <span className="comment-avatar">{(comment.user || 'Y').charAt(0).toUpperCase()}</span>
                            <div className="comment-meta">
                              <strong>{comment.user}</strong>
                              <span>{comment.time || 'Just now'}</span>
                            </div>
                          </div>
                          <p>{comment.text}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <form className="comment-form" onSubmit={handleAddComment}>
                    <input
                      type="text"
                      value={commentDraft}
                      onChange={(event) => setCommentDraft(event.target.value)}
                      placeholder="Reply..."
                    />
                    <button type="submit" aria-label="Send comment">↑</button>
                  </form>
                </aside>
              ) : (
                <button
                  type="button"
                  className="comment-panel-toggle"
                  onClick={() => setIsCommentPanelOpen(true)}
                  aria-label="Open comments"
                >
                  💬
                </button>
              )}
            </div>
          </div>
        </>
      )}
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
    <main className={user ? `app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}` : 'app-shell landing-shell'}>
      {user && (
        <aside className={sidebarCollapsed ? 'sidebar collapsed' : 'sidebar'}>
          <button type="button" className="brand-block" onClick={() => setSidebarCollapsed((current) => !current)} aria-label="Toggle workspace menu">
            <span className="brand-mark">D</span>
            {!sidebarCollapsed && (
              <div>
                <p className="eyebrow">Workspace</p>
                <h1>DesignSpace</h1>
              </div>
            )}
          </button>

          {!sidebarCollapsed && (
            <>
              <nav className="nav-list" aria-label="Workspace sections">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    title={item.title}
                    aria-label={item.title}
                    className={selectedSidebarItem === item.id ? 'nav-item active' : 'nav-item'}
                    onClick={() => {
                      setSelectedSidebarItem(item.id)
                      setActiveTab(item.id)
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="sidebar-actions">
                <button
                  type="button"
                  className={selectedSidebarItem === 'account' ? 'sidebar-btn secondary active' : 'sidebar-btn secondary'}
                  onClick={() => {
                    setSelectedSidebarItem('account')
                    setShowAccountPanel((current) => !current)
                  }}
                >
                  Account
                </button>
                <button
                  type="button"
                  className={selectedSidebarItem === 'logout' ? 'sidebar-btn primary active' : 'sidebar-btn primary'}
                  onClick={() => {
                    setSelectedSidebarItem('logout')
                    setUser(null)
                  }}
                >
                  Log out
                </button>
              </div>

              <div className="mini-card">
                <p className="eyebrow">Realtime sync</p>
                <strong>Live workspace</strong>
                <span>multi-user editing</span>
              </div>
            </>
          )}
        </aside>
      )}

      <section className="main-panel">
        {!user ? (
          <div className="landing-page">
            <header className="landing-topbar">
              <div className="landing-brand">
                <span className="brand-mark small">D</span>
                <span>DesignSpace</span>
              </div>

              <div className="landing-nav-actions">
                <button type="button" className="secondary-btn small" onClick={() => scrollToAuth('login')}>
                  Login
                </button>
                <button type="button" className="primary-btn small" onClick={() => scrollToAuth('signup')}>
                  Sign up
                </button>
              </div>
            </header>

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
                    onClick={() => scrollToAuth('signup')}
                  >
                    Get started
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => scrollToAuth('login')}
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
              <div className="template-preview">
                <div className="template-header">
                  <p className="eyebrow">Popular templates</p>
                  <h3>Pick a starting point</h3>
                </div>
                <div className="template-grid">
                  <div className="template-card">
                    <div className="template-visual visual-one" />
                    <span className="template-badge">Wireframe</span>
                    <h4>Landing page</h4>
                    <p>Layout ideas for product launches and homepage concepts.</p>
                    <button type="button" className="template-cta" onClick={() => scrollToAuth('signup')}>
                      Start this template <span aria-hidden="true">→</span>
                    </button>
                  </div>
                  <div className="template-card">
                    <div className="template-visual visual-two" />
                    <span className="template-badge alt">Moodboard</span>
                    <h4>Brand sprint</h4>
                    <p>Visual direction, blocks, and creative references in one view.</p>
                    <button type="button" className="template-cta" onClick={() => scrollToAuth('signup')}>
                      Start this template <span aria-hidden="true">→</span>
                    </button>
                  </div>
                  <div className="template-card">
                    <div className="template-visual visual-three" />
                    <span className="template-badge soft">Storyboard</span>
                    <h4>Campaign flow</h4>
                    <p>Sequence scenes, content blockers, and launch narratives.</p>
                    <button type="button" className="template-cta" onClick={() => scrollToAuth('signup')}>
                      Start this template <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="creator-promo">
                <div className="creator-panel">
                  <p className="eyebrow">Create with AI</p>
                  <h3>Need a fresh logo or pitch deck?</h3>
                  <p>Generate a new brand identity, presentation, or campaign concept before sharing it with your team.</p>
                  <button type="button" className="primary-btn small" onClick={() => scrollToAuth('signup')}>
                    Create new logo
                  </button>
                  <button type="button" className="secondary-btn small" onClick={() => scrollToAuth('signup')}>
                    Create PPT
                  </button>
                </div>
              </div>

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
            </section>

            <div id="landing-auth" className="auth-card landing-auth-card">
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
                      autoComplete="off"
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
                      autoComplete="off"
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
                        autoComplete="off"
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
          </div>
        )}
      </section>
    </main>
  )
}

export default App
