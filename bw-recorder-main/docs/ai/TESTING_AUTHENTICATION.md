# Authentication Testing Guide

## What Was Implemented

### 1. Login Route (`app/routes/login.tsx`)
- **URL**: `http://localhost:5173/login`
- **Features**:
  - Registration form (email + password)
  - Login form (email + password)
  - Server-side action that handles both registration and login
  - Sets session cookie on successful authentication
  - Redirects to home page (`/`) after successful auth

### 2. Logout Route (`app/routes/logout.tsx`)
- **URL**: POST to `http://localhost:5173/logout`
- **Features**:
  - Clears session cookie
  - Redirects to `/login`

### 3. Profile Route (`app/routes/profile.tsx`)
- **URL**: `http://localhost:5173/profile`
- **Features**:
  - Protected route (redirects to `/login` if not authenticated)
  - Shows current user information

### 4. User Menu Component (`app/components/user-menu.tsx`)
- **When NOT logged in**: Shows "Login" button linking to `/login`
- **When logged in**: Shows:
  - User avatar with initials
  - User name (visible on desktop)
  - Dropdown menu with:
    - Profile (links to `/profile`)
    - Settings
    - Billing
    - Support
    - Logout button (POST form to `/logout`)

### 5. Root Loader (`app/root.tsx`)
- Loads current user on every page request
- Passes user data to `UserMenu` component
- Handles unauthenticated state gracefully

## How to Test Manually

### Step 1: Access the Login Page
1. Open browser to: `http://localhost:5173/login`
2. You should see a "Sign in" heading with email and password fields

### Step 2: Register a New User
1. Enter an email (e.g., `test@example.com`)
2. Enter a password (e.g., `TestPass123`)
3. Click the "Register" button
4. You should be redirected to the home page (`/`)
5. Top-right corner should show your user avatar/name

### Step 3: Test the User Menu
1. Click on the user avatar in the top-right corner
2. Dropdown menu should appear with:
   - Your email
   - Profile link
   - Settings
   - Billing
   - Support
   - Log out button

### Step 4: Test Profile Page
1. Click "Profile" in the dropdown menu
2. You should see `/profile` page with your user information

### Step 5: Test Logout
1. Click on the user avatar again
2. Click "Log out"
3. You should be redirected to `/login`
4. Top-right corner should now show "Login" button instead of user avatar

### Step 6: Test Login (Existing User)
1. At `/login` page, enter the same credentials you registered with
2. Click "Sign in" button
3. You should be redirected to home page with user authenticated

## Testing with Browser DevTools

### Check Session Cookie
1. Open browser DevTools (F12)
2. Go to Application tab → Cookies
3. Look for cookie named `sinopsis_session`
4. Should contain JSON with `userId`
5. Cookie should have:
   - `HttpOnly`: true
   - `SameSite`: Lax
   - `Path`: /
   - `Max-Age`: 604800 (7 days)

### Check Network Requests
1. Open DevTools → Network tab
2. Submit login form
3. Look for POST request to `/login`
4. Response should be 302 redirect to `/`
5. Response headers should include `Set-Cookie` with session

## Common Issues & Solutions

### Issue: "Invalid credentials" after registration
**Cause**: User might already exist in database
**Solution**: Try logging in instead of registering, or use a different email

### Issue: Login button still shows after authentication
**Cause**: Session cookie not being set or read
**Solution**: 
- Check browser cookies (DevTools)
- Check server console for errors
- Verify DATABASE_URL is correct and database is accessible

### Issue: Redirected to login when accessing protected routes
**Cause**: Session expired or cookie not sent
**Solution**:
- Login again
- Check cookie expiration
- Ensure cookie is not blocked by browser settings

## Security Features Implemented

1. **Password Hashing**: Using Node.js crypto (scrypt) with random salt
2. **HTTP-Only Cookies**: Session cookie not accessible via JavaScript
3. **SameSite Protection**: Prevents CSRF attacks
4. **Secure Flag**: Enabled in production for HTTPS-only
5. **Session Expiry**: 7-day expiration with automatic cleanup
6. **Database Error Handling**: Graceful failures when DB is unreachable

## Database Schema

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  name VARCHAR,
  hashed_password VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API Endpoints

| Method | URL | Description | Response |
|--------|-----|-------------|----------|
| GET | `/login` | Show login/register form | HTML page |
| POST | `/login` | Handle login/register | 302 redirect to `/` with cookie |
| POST | `/logout` | Clear session | 302 redirect to `/login` |
| GET | `/profile` | Show user profile | HTML page (protected) |
| GET | `/` | Home page | HTML page with user menu |

## Next Steps for Enhancement

1. **Add password strength validator** on client-side
2. **Add "Remember Me" checkbox** for extended sessions
3. **Implement password reset** via email
4. **Add email verification** for new registrations
5. **Add rate limiting** on login attempts
6. **Add session management page** to view/revoke active sessions
7. **Add profile editing** functionality
8. **Add 2FA/MFA** support
9. **Add OAuth providers** (Google, GitHub, etc.)
10. **Add audit logging** for security events
