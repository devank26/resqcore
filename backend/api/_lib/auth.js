import { getAdminClient } from './supabase.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readBearerToken(req) {
  const value = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1] || null;
}

export async function getOptionalUser(req) {
  const token = readBearerToken(req);
  if (!token) return null;

  const { data, error } = await getAdminClient().auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'Invalid session. Sign in again.');
  return data.user;
}

export async function requireStaff(req, allowedRoles = ['command_admin', 'command_operator', 'rescue_team']) {
  const user = await getOptionalUser(req);
  if (!user) throw new ApiError(401, 'Sign in with an approved staff account.');

  const { data: roles, error } = await getAdminClient()
    .from('user_roles')
    .select('role, team_id, email')
    .eq('user_id', user.id);

  if (error) throw new ApiError(503, 'Could not verify staff permissions.');

  const role = allowedRoles
    .map((name) => (roles || []).find((item) => item.role === name))
    .find(Boolean);
  if (!role) {
    throw new ApiError(403, 'This account is not authorized for live operations. Request an approved staff invitation.');
  }

  return { user, role: role.role, teamId: role.team_id, email: role.email || user.email || '' };
}

export async function requireCommand(req) {
  return requireStaff(req, ['command_admin', 'command_operator']);
}

export async function requireAdmin(req) {
  return requireStaff(req, ['command_admin']);
}

export async function requireRescueTeam(req) {
  return requireStaff(req, ['rescue_team']);
}
