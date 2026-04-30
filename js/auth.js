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
    const checkGIS = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
            clearInterval(checkGIS);
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID,
                scope: CONFIG.SCOPES,
                prompt: 'select_account',
                callback: handleAuthCallback
            });
            signInBtn.removeAttribute('disabled');
            signInBtn.classList.remove('loading');
        }
    }, 100);

    signInBtn.addEventListener('click', () => {
        if (!tokenClient) {
            showAuthError('Загрузка... попробуйте через секунду');
            return;
        }
        // Don't show overlay here — it can suppress the popup in some browsers
        tokenClient.requestAccessToken();
    });

    document.getElementById('error-close')?.addEventListener('click', () => {
        document.getElementById('auth-error').classList.add('hidden');
    });
}

async function handleAuthCallback(response) {
    const loadingOverlay = document.getElementById('loading-overlay');

    if (response.error) {
        showAuthError('Ошибка авторизации: ' + (response.error_description || response.error));
        return;
    }

    try {
        loadingOverlay.classList.remove('hidden');
        const userInfo = await getUserInfo(response.access_token);

        if (userInfo.email !== CONFIG.ALLOWED_EMAIL) {
            showAuthError('Доступ запрещён. Используйте аккаунт: ' + CONFIG.ALLOWED_EMAIL);
            google.accounts.oauth2.revoke(response.access_token, () => {});
            loadingOverlay.classList.add('hidden');
            return;
        }

        const expiresAt = Date.now() + (response.expires_in * 1000);
        sessionStorage.setItem('access_token', response.access_token);
        sessionStorage.setItem('token_expires_at', String(expiresAt));
        sessionStorage.setItem('user_email', userInfo.email);
        sessionStorage.setItem('user_name', userInfo.name || '');

        window.location.href = 'app.html';
    } catch (err) {
        loadingOverlay.classList.add('hidden');
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

// On app.html: check and provide auth utilities
function getAccessToken() {
    return sessionStorage.getItem('access_token');
}

function isTokenValid() {
    const token = sessionStorage.getItem('access_token');
    const expiresAt = parseInt(sessionStorage.getItem('token_expires_at') || '0');
    return token && Date.now() < expiresAt - 60000; // 1 min buffer
}

function signOut() {
    const token = sessionStorage.getItem('access_token');
    if (token && window.google?.accounts?.oauth2) {
        google.accounts.oauth2.revoke(token, () => {});
    }
    sessionStorage.clear();
    window.location.href = 'index.html';
}

// Initialize on login page
if (document.getElementById('sign-in-btn')) {
    window.addEventListener('load', initLogin);
}
