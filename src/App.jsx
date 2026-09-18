import './App.css'

const highlights = [
  'React',
  'JavaScript',
  'WebSockets',
  'Azure',
]

const achievements = [
  {
    title: 'Real-time collaboration',
    description:
      'Constructed a real-time collaborative workspace using React and WebSockets, optimizing event-driven state updates to maintain sub-150ms execution latency.',
  },
  {
    title: 'Conflict resolution',
    description:
      'Integrated Last-Write-Wins (LWW) conflict resolution to resolve concurrent client mutations, streamlining deployment via Azure App Service.',
  },
]

function App() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="title-group">
          <span className="brand">DesignSpace</span>
          <span className="divider">|</span>
          <span className="tech-stack">
            {highlights.join(', ')}
          </span>
        </div>

        <a
          className="github-link"
          href="https://github.com/nandini11130/DesignSpace"
          target="_blank"
          rel="noreferrer"
        >
          [GitHub]
        </a>
      </header>

      <section className="content-panel">
        <ul className="achievement-list">
          {achievements.map((item) => (
            <li key={item.title} className="achievement-item">
              <span className="bullet">•</span>
              <p>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default App
