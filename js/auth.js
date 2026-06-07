const CONFIG = {
    CLIENT_ID: '1002412640105-nqvcd6vubdqmqva7gpc51csls8bpldlr.apps.googleusercontent.com',
    ALLOWED_EMAIL: '18mxiii@gmail.com',
    SPREADSHEET_ID: '1_WLXdEY9-IH34QzvmV6UYWikv6lEqcUJQwLHm6CBQv0',
    HOURLY_RATE: 700,
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'
};

let tokenClient = null;

function initLogin() {
    const signInBtn = document.getElementById('sign-in-btn');
    const loadingOverlay = document.getElementById('loading-overlay');

    // Already authenticated — go straight to app
    if (isTokenValid()) {
        window.location.href = 'app.html';
        return;
    }

    const checkGIS = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
            clearInterval(checkGIS);
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID,
                scope: CONFIG.SCOPES,
                callback: handleAuthCallback
            });

            const storedEmail = localStorage.getItem('user_email');
            if (storedEmail) {
                // Known user — try silent re-auth without showing any UI
                loadingOverlay.classList.remove('hidden');

                // Mobile browsers block unprompted popups — fall back to button if no response in 4s
                window._silentAuthTimeout = setTimeout(() => {
                    window._silentAuthTimeout = null;
                    loadingOverlay.classList.add('hidden');
                    signInBtn.removeAttribute('disabled');
                    signInBtn.classList.remove('loading');
                }, 4000);

                tokenClient.requestAccessToken({ prompt: '' });
            } else {
                signInBtn.removeAttribute('disabled');
                signInBtn.classList.remove('loading');
            }
        }
    }, 100);

    signInBtn.addEventListener('click', () => {
        if (!tokenClient) {
            showAuthError('Загрузка... попробуйте через секунду');
            return;
        }
        tokenClient.requestAccessToken({ prompt: 'select_account' });
    });

    document.getElementById('error-close')?.addEventListener('click', () => {
        document.getElementById('auth-error').classList.add('hidden');
    });
}

async function handleAuthCallback(response) {
    if (window._silentAuthTimeout) {
        clearTimeout(window._silentAuthTimeout);
        window._silentAuthTimeout = null;
    }

    const loadingOverlay = document.getElementById('loading-overlay');

    if (response.error) {
        // Silent auth failed — reveal the sign-in button
        loadingOverlay?.classList.add('hidden');
        const signInBtn = document.getElementById('sign-in-btn');
        if (signInBtn) {
            signInBtn.removeAttribute('disabled');
            signInBtn.classList.remove('loading');
        }
        // Only show an error message for explicit failures, not silent-auth fallbacks
        const silentErrors = ['access_denied', 'interaction_required', 'popup_closed_by_user'];
        if (!silentErrors.includes(response.error)) {
            showAuthError('Ошибка авторизации: ' + (response.error_description || response.error));
        }
        return;
    }

    try {
        loadingOverlay?.classList.remove('hidden');
        const userInfo = await getUserInfo(response.access_token);

        if (userInfo.email !== CONFIG.ALLOWED_EMAIL) {
            showAuthError('Доступ запрещён. Используйте аккаунт: ' + CONFIG.ALLOWED_EMAIL);
            google.accounts.oauth2.revoke(response.access_token, () => {});
            loadingOverlay?.classList.add('hidden');
            return;
        }

        const expiresAt = Date.now() + (response.expires_in * 1000);
        localStorage.setItem('access_token', response.access_token);
        localStorage.setItem('token_expires_at', String(expiresAt));
        localStorage.setItem('user_email', userInfo.email);
        localStorage.setItem('user_name', userInfo.name || '');

        window.location.href = 'app.html';
    } catch (err) {
        loadingOverlay?.classList.add('hidden');
        showAuthError('Ошибка при входе. Попробуйте ещё раз.');
        console.error('Auth error:', err);
    }
}

async function getUserInfo(token) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Failed to get user info');
    return res.json();
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    document.getElementById('error-text').textContent = msg;
    el.classList.remove('hidden');
}

function getAccessToken() {
    return localStorage.getItem('access_token');
}

function isTokenValid() {
    const token = localStorage.getItem('access_token');
    const expiresAt = parseInt(localStorage.getItem('token_expires_at') || '0');
    return !!(token && Date.now() < expiresAt - 60000);
}

function signOut() {
    const token = localStorage.getItem('access_token');
    if (token && window.google?.accounts?.oauth2) {
        google.accounts.oauth2.revoke(token, () => {});
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('token_expires_at');
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_name');
    window.location.href = 'index.html';
}

// Initialize on login page only
if (document.getElementById('sign-in-btn')) {
    window.addEventListener('load', initLogin);
}
