var githubScm = require('../../../src/scm/github.js');
var should = require('should');

//this is just simple integration testing
describe('github', function () {

    describe('#authorizeUrl()', function () {
        it('Should correctly generate url', function () {
            githubScm.authorizeUrl().should.eql("https://github.com/login/oauth/authorize?redirect_uri=https%3A%2F%2Fbeta.capsulecd.com%2Fauth%2Fcallback%2Fgithub&scope=user%3Aemail%2Crepo%2Cwrite%3Arepo_hook&client_id=ac97167cd722170814b8")
        });
    })

    describe('#swapOAuthToken() @nock', function () {
        it('Should correctly swap code for oauth credentials and request user data.', function (done) {
            githubScm.swapOAuthToken('c32649b2b25679a21176')
                .then(function(userEntry){
                    userEntry.ServiceType.should.eql('github');
                    userEntry.Username.should.eql('AnalogJ');
                    userEntry.Email.should.eql('jason@thesparktree.com')
                })
                .then(done)
                .fail(done)
        });
    })

    describe('#getUser() @nock', function () {
        it('Should correctly retrieve user model from scm', function (done) {
            var github_client = githubScm.getClient({AccessToken: 'placeholder_access_token'})

            githubScm.getUser(github_client)
                .then(function(userEntry){
                    userEntry.avatar_url.should.eql("https://avatars1.githubusercontent.com/u/891875?v=4")
                    userEntry.bio.should.eql("Devops/Automation guy. I build tools so you don't have to. \r\n\r\nI build things. Then I break them. Most of the time I fix them again.")
                    userEntry.login.should.eql("AnalogJ")

                })
                .then(done)
                .fail(done)
        });
    })

    describe('#getUserRepos() @nock', function () {
        it('Should correctly retrieve user repos from scm', function (done) {
            var github_client = githubScm.getClient({AccessToken: 'placeholder_access_token'})

            githubScm.getUserRepos(github_client)
                .then(function(repos){
                    repos[0].should.eql({name: 'alexa-ndncr', updated_at: '2018-06-13T06:38:12Z' })
                })
                .then(done)
                .fail(done)
        });
    })

    describe('#getRepoPullrequests() @nock', function () {
        it('Should correctly retrieve repo pull requests from scm', function (done) {
            var github_client = githubScm.getClient({AccessToken: 'placeholder_access_token'})

            githubScm.getRepoPullrequests(github_client, 'AnalogJ', 'lexicon')
                .then(function(prs){
                    prs[0].should.eql({
                        number: 284,
                        title: 'Handle non existing values in the output table of a list action',
                        body: 'Some providers do not respect the contract API in Lexicon, and do not provide an id for each returned record during a list action. This leads the generation of the table, which is the default output for a list action, to fail the process and return nothing. See #283.\r\n\r\nThis PR corrects that by returning an empty string if a given key do not exists in the records given by a provider.',
                        html_url: 'https://github.com/AnalogJ/lexicon/pull/284',
                        user: { login: 'adferrand', html_url: 'https://github.com/adferrand' },
                        updated_at: '2018-09-04T19:40:02Z'
                    })
                })
                .then(done)
                .fail(done)
        });
    })

    describe('#getRepoPullrequest() @nock', function () {
        it('Should correctly retrieve repo pull request from scm', function (done) {
            var github_client = githubScm.getClient({AccessToken: 'placeholder_access_token'})

            githubScm.getRepoPullrequest(github_client, 'AnalogJ', 'lexicon', '284' )
                .then(function(prs){
                    prs.should.eql({
                        number: 284,
                        title: 'Handle non existing values in the output table of a list action',
                        body: 'Some providers do not respect the contract API in Lexicon, and do not provide an id for each returned record during a list action. This leads the generation of the table, which is the default output for a list action, to fail the process and return nothing. See #283.\r\n\r\nThis PR corrects that by returning an empty string if a given key do not exists in the records given by a provider.',
                        html_url: 'https://github.com/AnalogJ/lexicon/pull/284',
                        user: { login: 'adferrand', html_url: 'https://github.com/adferrand' },
                        updated_at: '2018-09-04T19:40:02Z'
                    })
                })
                .then(done)
                .fail(done)
        });
    })
})