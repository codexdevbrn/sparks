import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { Login } from './pages/Login'
import { Profile } from './pages/Profile'
import { Feed } from './pages/Feed'
import { Sets } from './pages/Sets'
import { Events } from './pages/Events'
import { Members } from './pages/Members'
import { Picks } from './pages/Picks'
import { History } from './pages/History'
import { Online } from './pages/Online'
import { Rules } from './pages/Rules'
import { Polls } from './pages/Polls'
import { Shoutbox } from './pages/Shoutbox'
import { Bosses } from './pages/Bosses'

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
            <Route index element={<Feed />} />
            <Route path="mural" element={<Shoutbox />} />
            <Route path="online" element={<Online />} />
            <Route path="sets" element={<Sets />} />
            <Route path="historico" element={<History />} />
            <Route path="eventos" element={<Events />} />
            <Route path="bosses" element={<Bosses />} />
            <Route path="enquetes" element={<Polls />} />
            <Route path="regras" element={<Rules />} />
            <Route path="membros" element={<Members />} />
            <Route path="perfil" element={<Profile />} />
            <Route
              path="escolhas"
              element={
                <RequireAuth adminOnly>
                  <Picks />
                </RequireAuth>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
