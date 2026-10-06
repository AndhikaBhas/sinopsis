# Authentication Implementation Guide

## Overview

This project now includes a complete authentication system with user registration, login, logout, and session management.

## What Was Implemented

### 1. Database Schema
- Added `User` model to `prisma/schema.prisma`
- Fields: `id`, `email` (unique), `name`, `hashedPassword`, `createdAt`
- Table name: `users`

### 2. Authentication Server Module (`app/lib/auth.server.ts`)
- **registerUser**: Creates new users with hashed passwords using Node.js crypto (scrypt)
- **verifyCredentials**: Validates email/password combinations
- **createSessionCookie**: Generates HTTP-only session cookies
- **clearSessionCookie**: Clears session cookies on logout
- **parseSessionCookie**: Parses session data from request cookies
- **getCurrentUser**: Retrieves authenticated user from session

### 3. Routes
- **`app/routes/login.tsx`**: Login and registration form
  - POST action handles both login and registration
  - Uses `intent` field to distinguish between login/register
- **`app/routes/logout.tsx`**: Logout action
  - Clears session cookie and redirects to login
- **Root Loader (`app/root.tsx`)**: 
  - Loads current user on every request
  - Passes user data to `UserMenu` component

### 4. Security Features
- Passwords hashed using scrypt (Node.js crypto module)
- HTTP-only session cookies (7-day expiration)
- SameSite=Lax cookie policy
- Secure flag in production

## How to Use

### 1. Register a New User
Navigate to `http://localhost:5173/login` and:
1. Enter email address
2. Enter password
3. Click "Register" button
4. User will be automatically logged in after registration

### 2. Log In
Navigate to `http://localhost:5173/login` and:
1. Enter email address
2. Enter password
3. Click "Sign in" button

### 3. View Current User
Once logged in:
- User information appears in the top-right `UserMenu`
- Shows user name and email
- Avatar displays user initials

### 4. Log Out
1. Click the user avatar in the top-right corner
2. Select "Log out" from the dropdown menu
3. Session will be cleared and redirected to login page

## Session Management
- Sessions are stored in HTTP-only cookies
- Session duration: 7 days
- Sessions persist across browser restarts
- Logout action clears the session immediately

## API Endpoints
- `POST /login` - Handle login/registration
- `POST /logout` - Clear session and redirect to login

## Database Setup
The `users` table was created using:
```bash
npx prisma db push
```

## Dependencies Added
- `bcryptjs`: Password hashing (though we use Node crypto instead for simplicity)
- `cookie`: Cookie parsing utilities (manual implementation used)

## Security Notes
- Passwords are never stored in plain text
- Session cookies are HTTP-only (not accessible via JavaScript)
- Cookies use SameSite=Lax to prevent CSRF attacks
- Secure flag enabled in production for HTTPS-only cookies

## Future Enhancements
Consider adding:
- Password reset functionality
- Email verification
- Multi-factor authentication
- Role-based access control
- Session expiry refresh tokens
- Rate limiting on login attempts
