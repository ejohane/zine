import { verifyToken } from '@clerk/backend'
import { Context, Next } from 'hono'

export interface AuthContext {
  userId: string
  sessionId: string
}

export const authMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized - Missing or invalid authorization header' }, 401)
  }
  
  const token = authHeader.substring(7)
  
  try {
    const payload = await verifyToken(token, {
      secretKey: c.env.CLERK_SECRET_KEY,
    })
    
    if (!payload.sub) {
      return c.json({ error: 'Unauthorized - Invalid token payload' }, 401)
    }
    
    // Add user context to request
    c.set('auth', {
      userId: payload.sub,
      sessionId: payload.sid || '',
    })
    
    await next()
  } catch (error) {
    console.error('Token verification failed:', error)
    return c.json({ error: 'Unauthorized - Token verification failed' }, 401)
  }
}

// Helper function to get auth context from request
export const getAuthContext = (c: Context): AuthContext => {
  const auth = c.get('auth')
  if (!auth) {
    throw new Error('Auth context not found - make sure authMiddleware is applied')
  }
  return auth
}