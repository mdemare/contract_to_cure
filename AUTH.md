# JWT Authentication Implementation Guide

## Environment Variables

- `JWT_SECRET` - Secret key for signing/verifying JWT tokens (required)
- `AUTH_SERVICE_URL` - URL of the authentication service (required)
- `SUBDOMAIN` - Subdomain for the application (required)
- `DOMAIN_NAME` - Base domain name (required)

## JWT Token Structure

### Claims Format
```json
{
  "user": {
    "id": 123,
    "email": "user@example.com",
    "name": "John Doe",
    "role": "admin",
    "app_permissions": ["read", "write", "execute"]
  },
  "exp": 1234567890,
  "iat": 1234567890
}
```

### User Data Structure
- `id` (integer) - Unique user identifier
- `email` (string) - User's email address
- `name` (string) - User's display name
- `role` (string) - User role (e.g., "admin", "user", "viewer")
- `app_permissions` (array of strings) - List of permissions

## Implementation Steps

### 1. Token Storage
- Store JWT in HTTP-only cookie named `auth_token`
- Cookie domain: `.{DOMAIN_NAME}` (allows subdomain sharing)
- Cookie flags: `HttpOnly`, `Secure`, `SameSite=Lax`

### 2. Backend Validation
- Extract token from `auth_token` cookie
- Verify signature using `JWT_SECRET`
- Check token expiration
- Optionally validate user role (implementation-specific)
- Return appropriate HTTP status:
  - 401 - No token or invalid token
  - 403 - Valid token but insufficient permissions
  - 200 - Valid token with required permissions

### 3. Frontend Flow
- Check `/api/auth/check` on page load
- Handle responses:
  - 200 → Load application
  - 401 → Show "Authentication Required"
  - 403 → Show "Insufficient Permissions" message
- Redirect to `/login` which forwards to `AUTH_SERVICE_URL`

### 4. Login Flow
1. User clicks login → redirect to `/login`
2. `/login` redirects to `{AUTH_SERVICE_URL}/login?return_url=https://{SUBDOMAIN}.{DOMAIN_NAME}`
3. Auth service handles authentication
4. Sets `auth_token` cookie on `.{DOMAIN_NAME}`
5. Redirects back to application

### 5. API Protection
- Apply auth middleware to all `/api/*` routes
- Check every request for valid JWT
- Enforce role-based access control as needed
- No API calls without authentication

## Role-Based Access Control (Optional)
Some implementations may require specific roles:
- Check `user.role` field against required role(s)
- Return 403 if user lacks required role
- Common patterns:
  - Single role check (e.g., `role === "admin"`)
  - Multiple roles (e.g., `["admin", "manager"].includes(role)`)
  - Permission-based (check `app_permissions` array)

## Security Considerations
- Never expose `JWT_SECRET`
- Use HTTPS for all communication
- Validate JWT signature algorithm (HMAC)
- Set appropriate token expiration
- Cookie must be HTTP-only to prevent XSS
- Consider implementing refresh tokens for long sessions
