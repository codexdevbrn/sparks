import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { get, onValue, ref, serverTimestamp, set } from 'firebase/database'
import { auth, db, googleProvider } from './firebase'
import { errorMessage } from './format'
import type { Member } from '../types'

type AuthState = {
  /** Conta do Firebase Auth. */
  user: User | null
  /** Nó `members/{uid}` — fonte da verdade do cargo. */
  member: Member | null
  loading: boolean
  isMember: boolean
  isAdmin: boolean
  /**
   * Erro ao ler o próprio nó de membro (permissão, rede, etc.) — diferente
   * de "ainda não existe" ou "pending". Sem isso, um erro de leitura vira
   * `member: null` igual a um cadastro pendente de verdade, e a pessoa vê a
   * tela de "aguardando aprovação" mesmo já estando aprovada.
   */
  memberError: string | null
  signIn: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * Garante que todo usuário autenticado tenha um nó em `members`.
 * Novos usuários entram como `pending` e só o admin os promove — as regras
 * do banco impedem que o próprio usuário altere o próprio cargo.
 */
async function ensureMemberNode(user: User): Promise<void> {
  const node = ref(db, `members/${user.uid}`)
  const snap = await get(node)
  if (snap.exists()) return

  await set(node, {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    nick: '',
    charClass: '',
    role: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const [memberError, setMemberError] = useState<string | null>(null)

  useEffect(() => {
    let unsubMember: (() => void) | null = null

    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      unsubMember?.()
      unsubMember = null
      setUser(nextUser)
      setMemberError(null)

      if (!nextUser) {
        setMember(null)
        setLoading(false)
        return
      }

      try {
        await ensureMemberNode(nextUser)
      } catch (err) {
        console.error('Falha ao criar o nó de membro', err)
      }

      // Escuta em tempo real: uma promoção feita pelo admin reflete na hora.
      unsubMember = onValue(
        ref(db, `members/${nextUser.uid}`),
        (snap) => {
          const value = snap.val()
          setMember(value ? ({ ...value, uid: nextUser.uid } as Member) : null)
          setMemberError(null)
          setLoading(false)
        },
        (err) => {
          console.error('Falha ao observar o membro', err)
          // Erro de leitura não é a mesma coisa que "ainda pendente" — sem
          // separar os dois, quem já foi aprovado via a mesma tela de espera
          // quando o problema real era outro (permissão, rede, config).
          setMember(null)
          setMemberError(errorMessage(err))
          setLoading(false)
        },
      )
    })

    return () => {
      unsubMember?.()
      unsubAuth()
    }
  }, [])

  const value: AuthState = {
    user,
    member,
    loading,
    isMember: member?.role === 'member' || member?.role === 'admin',
    isAdmin: member?.role === 'admin',
    memberError,
    signIn: async () => {
      await signInWithPopup(auth, googleProvider)
    },
    logout: async () => {
      await signOut(auth)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
