function PullRequest (prNumber, prTitle, prBody, prLink, prUsername, prUserLink, prUpdatedAt) {
    return {
        number: prNumber || '',
        title: prTitle || '',
        body: (prBody || '').trim(),
        html_url: prLink || '',
        user: {
            login: prUsername || '',
            html_url: prUserLink || '',
        },
        updated_at: prUpdatedAt || ''
    }
}
module.exports = PullRequest