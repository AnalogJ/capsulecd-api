function AuthData (accessToken, refreshToken, raw) {
    return {
        AccessToken: accessToken || '',
        RefreshToken: refreshToken || '',
        Raw: raw || {}
    }
}
module.exports = AuthData;