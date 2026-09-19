# DesignSpace

DesignSpace is a local-first collaborative workspace for teams to create projects, manage members, and work together on live design boards. It combines secure auth, project management, reusable design templates, and a real-time canvas experience in one dashboard.

## Why this project

This app is designed for small teams that want to:

- create a shared workspace with project-based organization
- collaborate on visual ideas and layouts in real time
- leave comments and feedback directly on the board
- persist designs locally so work stays available after reloads or returning sessions
- preview a modern product workflow without needing a full hosted production setup yet

## Tech stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Realtime layer: Socket.IO
- Authentication: email/password login + OTP-based forgot-password flow
- Storage: browser localStorage for project and canvas persistence during local use
- Design: responsive dashboard layout with dark mode workspace styling

## Core features

- Landing page with promotional content, templates, testimonials, and CTA sections
- Sign up, login, and password reset flows
- Email OTP verification for forgot-password and reset flow
- Save and restore the latest password or reset state securely after verification
- Team and project creation with private/public project settings
- Shared canvas workspace for drawing, text, shapes, and comments
- On-canvas text editing, resize support, and style controls
- Comment panel with open/close and resizable behavior
- Persisted board state so drawings and edits remain after refresh or return login
- Auto-save behavior for project data and canvas updates in local browser storage
- Responsive layout for desktop, tablet, and mobile use

## Project workflow

```mermaid
flowchart TD
    A[Landing page] --> B[Sign up or login]
    B --> C{Forgot password?}
    C -->|No| D[Create or join a team]
    C -->|Yes| E[Enter email]
    E --> F[Send OTP]
    F --> G[Verify OTP]
    G --> H[Set new password]
    H --> I[Login with updated password]
    I --> D
    D --> J[Create project]
    J --> K[Choose public/private settings]
    K --> L[Open canvas workspace]
    L --> M[Draw, add text, shapes, comments]
    M --> N[Save canvas state locally]
    N --> O[Return later and continue work]
```

## Screenshots

### Landing page

![Landing page screenshot](docs/screenshots/designspace-landing.svg)

### Team dashboard

![Dashboard screenshot](docs/screenshots/designspace-dashboard.svg)

### Collaborative canvas workspace

![Canvas screenshot](docs/screenshots/designspace-canvas.svg)

## Project structure

- frontend/: React app and UI screens
- backend/: Express API, auth endpoints, and realtime server
- docs/screenshots/: demo screenshots for the project overview
- README.md: project overview and run instructions

## Run locally

Open two terminals and run the following commands.

### 1) Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend should run on:

```text
http://localhost:5177
```

### 2) Backend

```bash
cd backend
npm install
npm run dev
```

The backend should run on:

```text
http://localhost:4000
```

### Quick full setup

```bash
cd frontend && npm install && npm run dev
```

In a second terminal:

```bash
cd backend && npm install && npm run dev
```

## Notes

- This project is currently intended for local development and demo use.
- The app persists project and canvas state in the browser using localStorage.
- The OTP flow is local-only and designed for demo use before a production email provider is configured.
- Real production deployment should be done only after adding a secure domain, environment variables, and a production-grade email service.

## Recommended next steps

1. Add a deployed backend with a real database and SMTP provider
2. Replace browser localStorage with a server-backed database for multi-user persistence
3. Add production auth rules, environment validation, and deployment pipeline
4. Expand collaboration with real-time object locking and multi-user cursor syncing
