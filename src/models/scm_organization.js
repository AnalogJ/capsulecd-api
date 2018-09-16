function ScmOrganization (orgName, orgDescription, orgBio, orgAvatar) {
    return {
        avatar_url: orgAvatar || '',
        bio: orgBio || '',
        description: orgDescription || '',
        login: orgName
    }
}
module.exports = ScmOrganization