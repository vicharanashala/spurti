/**
 * middleware/auth.js
 *
 * Samagama cookie-based authentication utilities for the P2P Challenge feature.
 * Mirrors the cookie-parsing pattern already in server.js.
 *
 * Auth flow: client sends `chatengine_token` cookie → we forward it to
 * SAMAGAMA_AUTH_URL → on success, look up Student by email.
 */

import { SAMAGAMA_AUTH_URL } from '../config.js';
import Student from '../models/Student.js';

/**
 * Parses the Cookie header into a key/value object.
 * Mirrors the parseCookies() function in server.js.
 *
 * @param {string} header
 * @returns {Record<string, string>}
 */
export function parseCookies(header = '') {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map((part) => {
        const index = part.indexOf('=');
        if (index < 0) return null;
        return [
          part.slice(0, index).trim(),
          decodeURIComponent(part.slice(index + 1).trim()),
        ];
      })
      .filter(Boolean)
  );
}

/**
 * Validates the student's Samagama session by forwarding the chatengine_token
 * cookie to SAMAGAMA_AUTH_URL. Returns the Samagama user object on success,
 * null on any failure.
 *
 * @param {string} chatengineToken
 * @returns {Promise<object|null>}
 */
export async function getSamagamaUser(chatengineToken) {
  if (!chatengineToken) return null;
  try {
    const res = await fetch(SAMAGAMA_AUTH_URL, {
      headers: { cookie: `chatengine_token=${chatengineToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Resolves the authenticated Student document from the request's cookies.
 * Returns null if unauthenticated or the student is not found in the DB.
 *
 * @param {import('express').Request} req
 * @returns {Promise<import('mongoose').Document|null>}
 */
export async function getStudentFromRequest(req) {
  // Prefer the cookie (production path). Fall back to the X-ChatEngine-Token
  // custom header sent by challenges.jsx in cross-origin local dev environments
  // where the HttpOnly cookie cannot be forwarded automatically.
  const cookies = parseCookies(req.headers.cookie || '');
  const tokenFromCookie = cookies.chatengine_token;
  const tokenFromHeader = req.headers['x-chatengine-token'] ?? null;
  const chatengineToken = tokenFromCookie || tokenFromHeader;

  const samagamaData = await getSamagamaUser(chatengineToken);

  const email =
    samagamaData?.user?.email ||
    samagamaData?.email ||
    null;

  if (!email) return null;

  const student = await Student.findOne({
    $or: [
      { email: email.toLowerCase().trim() },
      { alternateEmail: email.toLowerCase().trim() },
    ],
  });

  return student ?? null;
}
