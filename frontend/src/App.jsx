import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const API_URL = 'http://localhost:4000'

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

function App() {
  const socketRef = useRef(null)
  const [authMode, setAuthMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', otp: '' })
  const [otpSent, setOtpSent] = useState(false)
  const [status, setStatus] = useState('Ready to sign in')
  const [user, setUser] = useState(null)
  const [team, setTeam] = useState(starterTeam)
  const [messageText, setMessageText] = useState('')

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

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
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
    setStatus('Processing your request...')

    try {
      const endpoint =
        authMode === 'signup'
          ? '/api/auth/signup'
          : authMode === 'otp'
            ? '/api/auth/verify-otp'
            : '/api/auth/login'

      const payload = authMode === 'otp'
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
      setUser(data.user)
      setStatus(`${authMode === 'signup' ? 'Account created' : authMode === 'otp' ? 'OTP verified' : 'Logged in'} successfully.`)
      setOtpSent(false)
      setForm((current) => ({ ...current, password: '', otp: '' }))
      await fetchTeamData()
    } catch {
      setStatus('Authentication failed. Demo mode enabled.')
      const fallbackUser = {
        id: 'demo-user',
        name: form.name || form.email.split('@')[0] || 'Demo User',
        email: form.email || 'demo@designspace.io',
        role: 'member',
      }
      setUser(fallbackUser)
      setOtpSent(false)
      setForm((current) => ({ ...current, password: '', otp: '' }))
      await fetchTeamData()
    }
  }

  const handleSendOtp = async () => {
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
          <button type="button" className="nav-item active">Overview</button>
          <button type="button" className="nav-item">Projects</button>
          <button type="button" className="nav-item">Teams</button>
          <button type="button" className="nav-item">Reports</button>
        </nav>

        <div className="mini-card">
          <p className="eyebrow">Realtime sync</p>
          <strong>Latency</strong>
          <span>sub-150ms</span>
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
                  <input name="name" value={form.name} onChange={handleChange} placeholder="Your name" />
                </label>
              )}

              <label>
                <span>Email</span>
                <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" />
              </label>

              {authMode !== 'otp' && (
                <label>
                  <span>Password</span>
                  <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="••••••••" />
                </label>
              )}

              {authMode === 'otp' && (
                <>
                  <button type="button" className="secondary-btn" onClick={handleSendOtp}>Send OTP</button>
                  {otpSent && (
                    <label>
                      <span>Verification code</span>
                      <input name="otp" value={form.otp} onChange={handleChange} placeholder="123456" />
                    </label>
                  )}
                </>
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

            <div className="stats-grid">
              <div className="stat-card">
                <span>Active tasks</span>
                <strong>18</strong>
              </div>
              <div className="stat-card">
                <span>Completed</span>
                <strong>64%</strong>
              </div>
              <div className="stat-card">
                <span>Realtime users</span>
                <strong>9</strong>
              </div>
            </div>

            <div className="workspace-grid">
              <div className="panel members-panel">
                <h4>Team members</h4>
                <ul>
                  {team.members.map((member) => (
                    <li key={member}>{member}</li>
                  ))}
                </ul>
              </div>

              <div className="panel activity-panel">
                <h4>Activity</h4>
                <ul>
                  {team.activity.map((item, index) => (
                    <li key={`${item.user}-${index}`}>
                      <strong>{item.user}</strong>
                      <span>{item.action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="panel chat-panel">
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
        )}
      </section>
    </main>
  )
}

export default App
