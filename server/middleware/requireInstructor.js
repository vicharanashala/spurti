import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.SPURTI_AUTH_SECRET || process.env.JWT_SECRET || 'spurti-secret-key-2026';

export function requireInstructor(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.role !== 'instructor') {
      return res.status(403).json({ error: 'Instructor access only' });
    }
    req.instructor = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired, please login again' });
    }
    return res.status(401).json({ error: 'Authentication required' });
  }
}
