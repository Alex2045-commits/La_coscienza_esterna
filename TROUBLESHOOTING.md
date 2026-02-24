# System Status & Troubleshooting Guide

## API Endpoints Health Check

### Production Endpoints
- **Port 8000**: Backend PHP Server (APIs, Dashboards)
- **Port 4000**: Frontend Assets (Login, Static Files)

### Test Endpoint
```
GET http://localhost:8000/api/test.php
```
Response will show database, session, and function availability.

## Common Errors & Solutions

### Error 400 (Bad Request)
**Causes:**
1. Missing CSRF token in request headers
   - **Solution**: Ensure `X-CSRF-Token` header is included
   - Token is available in `meta[name="csrf-token"]` or cookies

2. Invalid JSON in POST body
   - **Solution**: Validate JSON with `JSON.parse()` before sending
   - Check Content-Type: `application/json`

3. Missing required fields
   - **Solution**: Check API documentation for required parameters

### Error 403 (Forbidden)
**Causes:**
1. IP is banned
   - **Solution**: Check if IP is in `ip_bans` table, wait for ban duration

2. CSRF token mismatch
   - **Solution**: Ensure token matches in cookies and headers

3. User is banned
   - **Solution**: Check user's `banned_until` timestamp in database

### Error 404 (Not Found)
**Causes:**
1. Wrong port or path
   - **Solution**: 
     - Dashboards: `http://localhost:8000/admin/` or `/user/`
     - APIs: `http://localhost:8000/api/`
     - Assets: `http://localhost:4000/`

2. Missing file
   - **Solution**: Verify file exists and path is correct

### Error 500 (Internal Server Error)
**Causes:**
1. Database connection error
   - **Solution**: Check config.php DSN, database is running
   - Run: `GET http://localhost:8000/api/test.php`

2. Syntax error in PHP
   - **Solution**: Check error logs in browser console (Network tab)
   - Files already validated and error-free

3. Missing required file includes
   - **Solution**: Verify all `require_once` paths are correct
   - Path format: `__DIR__ . '/file.php'` not `/../file.php`

4. PDO Exception - parameter mismatch
   - **Solution**: Ensure `?` placeholders match array count in execute()
   - All files already fixed and tested

## File Structure Verification

### PHP Files (All Error-Free ✓)
- ✓ `api/get_progress.php` - Returns user progress
- ✓ `api/gain_xp.php` - Adds XP and handles level-up
- ✓ `api/save_progress.php` - Anti-cheat validation + save
- ✓ `api/avatar_select.php` - Change user avatar
- ✓ `api/avatar_upload.php` - Upload custom avatar
- ✓ `user/user_dashboard.php` - User dashboard template
- ✓ `admin/admin_dashboard.php` - Admin dashboard template

### JavaScript Files (Validated)
- ✓ `auth.js` - Safe fetch, CSRF handling, auth checks
- ✓ `user/user_dashboard.js` - Complete, all functions implemented
- ✓ `login/login.js` - Role-based redirect logic
- ✓ `user/email_otp.js` - OTP handling

### CSS Files (Enhanced)
- ✓ `user/user_dashboard.css` - Modern UI with gradients, animations, responsive

## Anti-Cheat Systems

### XP System
- ✓ XP cannot decrease
- ✓ Level can only increase by +1 per update
- ✓ Coins cannot increase more than +100 per update
- ✓ Logged as "cheat_detect" if violated

### Session Protection
- ✓ 2FA for admin users
- ✓ Email OTP on brute-force attempts
- ✓ IP banning for suspicious activity
- ✓ CSRF tokens for all state-changing requests

## CORS Configuration
- ✓ Allows: `http://localhost:4000`
- ✓ Credentials: Enabled
- ✓ Methods: GET, POST, OPTIONS, PUT, DELETE
- ✓ Headers: Content-Type, Authorization, X-CSRF-Token, X-Requested-With

## Recent Fixes Applied

1. **Fixed PDO parameter mismatch** in `utils.php` handleSecurityScore()
2. **Corrected PHP include paths** from `/../config.php` to `/config.php`
3. **Fixed duplicate auth_user() calls** in get_progress.php
4. **Enhanced error handling** in all API endpoints
5. **Modernized UI** with gradient backgrounds, animations, glass-morphism effects
6. **Responsive design** for mobile devices (breakpoint: 768px)

## To Debug an Issue:

1. Open Developer Tools (F12)
2. Switch to Network tab
3. Try the failing action
4. Click the failed request
5. Check Response tab for error message
6. Cross-reference with this guide
7. If still stuck, visit: `http://localhost:8000/api/test.php`

## Monitoring

All critical actions are logged:
- Login attempts (failed/successful)
- 2FA usage
- XP gains
- Avatar changes
- Security incidents (SQL injection attempts, brute-force, IP bans)
- Admin actions

Check `security_audit` and `admin_logs` tables for complete history.
