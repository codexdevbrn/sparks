import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getDatabase } from 'firebase/database'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// `storageBucket` e `messagingSenderId` entram na config por convenção, mas o app
// não usa Storage nem Messaging — faltar um deles não impede nada de funcionar.
const REQUIRED = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'] as const

const missing = REQUIRED.filter((key) => !config[key])

if (missing.length > 0) {
  throw new Error(
    `Configuração do Firebase incompleta: ${missing.join(', ')}. ` +
      'Copie .env.example para .env.local e preencha as variáveis VITE_FIREBASE_*.',
  )
}

const app = initializeApp(config)

export const auth = getAuth(app)
export const db = getDatabase(app)
export const googleProvider = new GoogleAuthProvider()

export const GUILD_NAME = import.meta.env.VITE_GUILD_NAME || 'Guild'
