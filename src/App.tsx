import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { Login } from './pages/Login'
import { Profile } from './pages/Profile'
import { Announcements } from './pages/Announcements'
import { Sets } from './pages/Sets'
import { Events } from './pages/Events'
import { Members } from './pages/Members'

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Announcements />} />
            <Route path="sets" element={<Sets />} />
            <Route path="eventos" element={<Events />} />
            <Route path="membros" element={<Members />} />
            <Route path="perfil" element={<Profile />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
