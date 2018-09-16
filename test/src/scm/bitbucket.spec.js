var bitbucketScm = require('../../../src/scm/bitbucket.js');
var should = require('should');
var nconf = require('../../../src/common/nconf');

//this is just simple integration testing
describe('bitbucket', function () {

    describe('#authorizeUrl()', function () {
        it('Should correctly generate url', function () {
            bitbucketScm.authorizeUrl().should.eql("https://bitbucket.org/site/oauth2/authorize?response_type=code&client_id=" + nconf.get('BITBUCKET_APP_CLIENT_KEY'))
        });
    })

    describe('#swapOAuthToken() @nock', function () {
        it('Should correctly swap code for oauth credentials and request user data.', function (done) {
            bitbucketScm.swapOAuthToken('68BuaD9Gnxpx8ybkVp')
                .then(function(userEntry){
                    userEntry.ServiceType.should.eql('bitbucket')
                    userEntry.Username.should.eql('sparktree')
                    userEntry.Email.should.eql('jk17@ualberta.ca')
                })
                .then(done)
                .fail(done)
        });
    })

    describe('#getUser() @nock', function () {
        it('Should correctly retrieve user model from scm', function (done) {
            var bitbucket_client = bitbucketScm.getClient({RefreshToken: 'placeholder_refresh_token'})

            bitbucketScm.getUser(bitbucket_client)
                .then(function(userEntry){
                    userEntry.avatar_url.should.eql("https://bitbucket.org/account/sparktree/avatar/")
                    userEntry.description.should.eql("SparkTree Inc NA")
                    userEntry.login.should.eql("sparktree")
                })
                .then(done)
                .fail(done)
        });
    })

    describe('#getUserRepos() @nock', function () {
        it('Should correctly retrieve user repos from scm', function (done) {
            var bitbucket_client = bitbucketScm.getClient({RefreshToken: 'placeholder_refresh_token'})

            bitbucketScm.getUserRepos(bitbucket_client, 'sparktree')
                .then(function(repos){
                    repos[0].should.eql({
                        name: 'sparktree.torrentleechrss',
                        updated_at: '2012-07-31T16:33:13.483006+00:00'
                    })
                })
                .then(done)
                .fail(done)
        });
    })

    describe('#getRepoPullrequests() @nock', function () {
        it('Should correctly retrieve repo pull requests from scm', function (done) {
            var bitbucket_client = bitbucketScm.getClient({RefreshToken: 'placeholder_refresh_token'})

            bitbucketScm.getRepoPullrequests(bitbucket_client, 'sparktree', 'gem_analogj_test')
                .then(function(prs){
                    prs[0].should.eql({
                        number: 3,
                        title: 'test_pr3 created online with Bitbucket',
                        body: '',
                        html_url: 'https://bitbucket.org/sparktree/gem_analogj_test/pull-requests/3',
                        user:  {
                            login: 'sparktree',
                            html_url: 'https://bitbucket.org/sparktree/'
                        },
                        updated_at: '2018-08-29T18:23:52.073299+00:00'
                    })
                })
                .then(done)
                .fail(done)
        });
    })

    describe('#getRepoPullrequest() @nock', function () {
        it('Should correctly retrieve repo pull request from scm', function (done) {
            var bitbucket_client = bitbucketScm.getClient({RefreshToken: 'placeholder_refresh_token'})

            bitbucketScm.getRepoPullrequest(bitbucket_client, 'sparktree', 'gem_analogj_test', '3' )
                .then(function(prs){
                    prs.should.eql({
                        number: 3,
                        title: 'test_pr3 created online with Bitbucket',
                        body: '',
                        html_url: 'https://bitbucket.org/sparktree/gem_analogj_test/pull-requests/3',
                        user:  {
                            login: 'sparktree',
                            html_url: 'https://bitbucket.org/sparktree/'
                        },
                        updated_at: '2018-08-29T18:23:52.073299+00:00'
                    })
                })
                .then(done)
                .fail(done)
        });
    })
})