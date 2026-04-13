import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const { username, password } = credentials as {
          username: string
          password: string
        }

        const validUsername = process.env.UI_USERNAME ?? 'admin'
        const validHash = process.env.UI_PASSWORD_HASH ?? ''

        if (username !== validUsername) return null

        const isValid = await bcrypt.compare(password, validHash)
        if (!isValid) return null

        return { id: '1', name: username, email: `${username}@localhost` }
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
})
