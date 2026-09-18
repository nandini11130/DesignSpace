import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const API_URL = 'http://localhost:4000'
const NAV_ITEMS = ['overview', 'projects', 'teams', 'reports']
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
  const [form, setForm] = useState({ name: '', email: '', password: '', otp: '' })
  const [otpSent, setOtpSent] = useState(false)
  const [status, setStatus] = useState('Ready to sign in')
  const [user, setUser] = useState(null)
  const [team, setTeam] = useState(starterTeam)
  const [messageText, setMessageText] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [tool, setTool] = useState('pencil')
  const [lineColor, setLineColor] = useState('#7c3aed')
  const [lineWidth, setLineWidth] = useState(3)
  const [canvasHistory, setCanvasHistory] = useState([])
  const [canvasFuture, setCanvasFuture] = useState([])
  const [groups, setGroups] = useState(defaultGroups)
  const [activeTasks, setActiveTasks] = useState(defaultTasks)

  const passwordStrength = getPasswordStrength(form.password)

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

      if (passwordStrength.label === 'Weak') {
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

    const validationError = validateAuthForm(authMode)
    if (validationError) {
      setStatus(validationError)
      return
    }

    setStatus('Processing your request...')

    try {
      const endpoint =
        authMode === 'signup'
          ? '/api/auth/signup'
          : authMode === 'otp'
            ? '/api/auth/verify-otp'
            : '/api/auth/login'

      const payload =
        authMode === 'otp'
          ? { email: form.email, otp: form.otp }
          : authMode === 'signup'
            ? { name: form.name, email: form.email, password: form.password }
            : { email: form.email, password: form.password }

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Authentication failed')
      }

      const data = await response.json()
      const loggedUser = data.user || {
        id: 'demo-user',
        name: form.name || form.email.split('@')[0] || 'Demo User',
        email: form.email || 'demo@designspace.io',
        role: 'member',
      }
      setUser(loggedUser)
      setGroups(defaultGroups)
      setActiveTasks(defaultTasks)
      setStatus(`${authMode === 'signup' ? 'Account created' : authMode === 'otp' ? 'OTP verified' : 'Logged in'} successfully.`)
      setOtpSent(false)
      setForm((current) => ({ ...current, password: '', otp: '' }))
      setActiveTab('overview')
      await fetchTeamData()
    } catch {
      setStatus(authMode === 'otp' ? 'OTP check failed, but demo mode is ready.' : 'Authentication failed. Demo mode enabled.')
      const fallbackUser = {
        id: 'demo-user',
        name: form.name || form.email.split('@')[0] || 'Demo User',
        email: form.email || 'demo@designspace.io',
        role: 'member',
      }
      setUser(fallbackUser)
      setGroups(defaultGroups)
      setActiveTasks(defaultTasks)
      setOtpSent(false)
      setForm((current) => ({ ...current, password: '', otp: '' }))
      setActiveTab('overview')
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

      if (!response.ok) throw new Error('OTP request failed')
      setOtpSent(true)
      setStatus('One-time password sent to your email.')
    } catch {
      setOtpSent(true)
      setStatus('Demo OTP sent. Use 123456 in the verification box.')
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

  const renderOverview = () => (
    <div className="content-stack">
      <div className="card-grid three-up">
        <article className="panel stat-card">
          <span>Storyboards</span>
          <strong>7 active</strong>
        </article>
        <article className="panel stat-card">
          <span>Concept drafts</span>
          <strong>12 files</strong>
        </article>
        <article className="panel stat-card">
          <span>Live reviews</span>
          <strong>3 sessions</strong>
        </article>
      </div>

      <div className="card-grid two-up">
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
          <h4>Active tasks</h4>
          <ul className="task-list">
            {activeTasks.map((task) => (
              <li key={task.title}>
                <strong>{task.title}</strong>
                <span>{task.priority} · {task.due}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )

  const renderProjects = () => (
    <div className="content-stack">
      <div className="panel project-panel">
        <div className="project-toolbar">
          <div>
            <p className="eyebrow">Collaboration board</p>
            <h3>Design workspace</h3>
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

            <button type="button" className="secondary-btn small" onClick={() => fileInputRef.current?.click()}>
              Upload media
            </button>
            <button type="button" className="secondary-btn small" onClick={handleUndo} disabled={canvasHistory.length === 0}>
              Undo
            </button>
            <button type="button" className="secondary-btn small" onClick={handleRedo} disabled={canvasFuture.length === 0}>
              Redo
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

  const renderReports = () => (
    <div className="content-stack">
      <div className="report-grid">
        <article className="panel report-card">
          <p className="eyebrow">Sprint notes</p>
          <h4>Customer journey</h4>
          <p>Wireframe is ready for review with product, marketing, and design leads.</p>
        </article>

        <article className="panel report-card">
          <p className="eyebrow">Feedback loop</p>
          <h4>Brand review</h4>
          <p>Align the visual language, content structure, and collaboration rules.</p>
        </article>

        <article className="panel report-card">
          <p className="eyebrow">Next steps</p>
          <h4>Launch prep</h4>
          <p>Move to concept sign-off and final stakeholder approval before publishing.</p>
        </article>
      </div>
    </div>
  )

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark">D</span>
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>DesignSpace</h1>
          </div>
        </div>

        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              type="button"
              className={activeTab === item ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveTab(item)}
            >
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>

        <div className="mini-card">
          <p className="eyebrow">Realtime sync</p>
          <strong>Live workspace</strong>
          <span>multi-user editing</span>
        </div>
      </aside>

      <section className="main-panel">
        {!user ? (
          <div className="auth-card">
            <div className="auth-header">
              <div>
                <p className="eyebrow">Welcome</p>
                <h2>Collaborate smarter</h2>
              </div>
              <div className="mode-switch">
                {['login', 'signup', 'otp'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={authMode === mode ? 'mode active' : 'mode'}
                    onClick={() => setAuthMode(mode)}
                  >
                    {mode === 'login' ? 'Login' : mode === 'signup' ? 'Sign up' : 'OTP'}
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

              {authMode !== 'otp' && (
                <label>
                  <span>Password</span>
                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    required
                  />
                </label>
              )}

              {authMode === 'otp' && (
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

              {authMode !== 'otp' && form.password && (
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

              <button type="submit" className="primary-btn">
                {authMode === 'login' ? 'Sign in' : authMode === 'signup' ? 'Create account' : 'Verify OTP'}
              </button>
            </form>

            <p className="status">{status}</p>
          </div>
        ) : (
          <div className="dashboard">
            <header className="dashboard-header">
              <div>
                <p className="eyebrow">Welcome back</p>
                <h2>{user.name}</h2>
              </div>
              <button type="button" className="primary-btn small" onClick={() => setUser(null)}>
                Log out
              </button>
            </header>

            <section className="team-header">
              <div>
                <p className="eyebrow">Current team</p>
                <h3>{team.name}</h3>
              </div>
              <span className="team-pill">{team.members.length} members</span>
            </section>

            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'projects' && renderProjects()}
            {activeTab === 'teams' && renderTeams()}
            {activeTab === 'reports' && renderReports()}
          </div>
        )}
      </section>
    </main>
  )
}

export default App
