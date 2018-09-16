function ScmPullRequest (prNumber, prTitle, prBody, prLink, prUsername, prUserLink, prUpdatedAt, prState) {
    return {
        number: prNumber || '',
        title: prTitle || '',
        body: (prBody || '').trim(),
        html_url: prLink || '',
        user: {
            login: prUsername || '',
            html_url: prUserLink || '',
        },
        updated_at: prUpdatedAt || '',
        state: prState || ''
    }
}
module.exports = ScmPullRequest