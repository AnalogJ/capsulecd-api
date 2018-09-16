function ScmRepository (repoName, repoUpdatedAt) {
    return {
        name: repoName || '',
        updated_at: repoUpdatedAt || ''
    }
}
module.exports = ScmRepository