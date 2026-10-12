import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { AuthProbe } from '../auth.mjs'
import { createLabServer } from '../server.mjs'
import { request as httpRequest } from 'node:http'

test('identity network failures identify the provider stage without exposing private request details', async () => {
  for (const failure of [new DOMException('private-timeout-details', 'TimeoutError'), new TypeError('fetch failed', {cause:{code:'ECONNRESET',message:'private-token-or-proxy'}})]) {
    const auth = new AuthProbe({fetcher:async()=>{throw failure}})
    await assert.rejects(auth.githubStart({clientId:'public-app-id',peer:'peer-one'}), error => {
      assert.match(error.message, /本机身份 helper.*github.com\/login\/device\/code/)
      assert.match(error.message, /登录服务请求失败/)
      assert.doesNotMatch(error.message, /private-|fetch failed/)
      return true
    })
  }
})

test('GitHub device authorization respects slow_down, binds peer identity and does not return access tokens', async () => {
  let time=100000, polls=0
  const auth=new AuthProbe({now:()=>time,fetcher:async(url,options)=>{
    if(url.endsWith('/device/code')){assert.equal(new URLSearchParams(options.body).get('scope'),'read:user');return Response.json({device_code:'private-device',user_code:'ABCD-1234',verification_uri:'https://github.com/login/device',expires_in:900,interval:5})}
    if(url.endsWith('/access_token')){polls++;assert.equal(new URLSearchParams(options.body).has('client_secret'),false);return Response.json(polls===1?{error:'slow_down'}:{access_token:'private-access'})}
    assert.equal(options.headers.Authorization,'Bearer private-access');return Response.json({id:42,login:'test-user'})
  }})
  const input={clientId:'public-app-id',peer:'peer-one'},start=await auth.githubStart(input)
  assert.equal(JSON.stringify(start).includes('private-device'),false)
  assert.equal((await auth.githubStart(input)).attemptId,start.attemptId)
  await assert.rejects(auth.githubStatus({attemptId:start.attemptId,peer:'peer-two'}),/当前设备/)
  assert.equal((await auth.githubStatus({attemptId:start.attemptId,peer:input.peer})).interval,10)
  await auth.githubStatus({attemptId:start.attemptId,peer:input.peer});assert.equal(polls,1)
  time+=10000;const result=await auth.githubStatus({attemptId:start.attemptId,peer:input.peer})
  assert.equal(result.status,'verified');assert.equal(result.identity.subject,'42');assert.equal(JSON.stringify(result).includes('private-access'),false)
})
test('Google verifies actual RSA signatures and rejects wrong audience, nonce replay, expiry and forged signatures', async () => {
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'test-key'}
  const auth=new AuthProbe({now:()=>1000000,fetcher:async()=>Response.json({keys:[jwk]})}),clientId='test.apps.googleusercontent.com',peer='peer-google'
  function token(nonce,overrides={},key=privateKey){const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url'),b=Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:clientId,sub:'google-123',iat:1000,exp:1300,nonce,...overrides})).toString('base64url');return h+'.'+b+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+b),key).toString('base64url')}
  let challenge=auth.googleChallenge({clientId,peer})
  await assert.rejects(auth.googleVerify({peer,credential:token(challenge.nonce,{aud:'other-app'})}),/当前应用/)
  await assert.rejects(auth.googleVerify({peer,credential:token('wrong')}),/重放/)
  await assert.rejects(auth.googleVerify({peer,credential:token(challenge.nonce,{exp:900})}),/过期/)
  const forged=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey
  await assert.rejects(auth.googleVerify({peer,credential:token(challenge.nonce,{},forged)}),/签名/)
  const valid=token(challenge.nonce);assert.equal((await auth.googleVerify({peer,credential:valid})).identity.subject,'google-123')
  await assert.rejects(auth.googleVerify({peer,credential:valid}),/不存在/)
})
test('loopback helper rejects foreign origins, DNS rebinding and form submissions', async t => {
  const server=await createLabServer({port:0,auth:{githubStart:async()=>({ok:true})}});t.after(()=>new Promise(resolve=>server.close(resolve)))
  const origin='http://127.0.0.1:'+server.address().port,headers={Origin:origin,'X-Remote-Lab':'1','Content-Type':'application/json'}
  assert.equal((await fetch(origin+'/api/github/start',{method:'POST',headers,body:'{}'})).status,200)
  assert.equal((await fetch(origin+'/api/github/start',{method:'POST',headers:{...headers,Origin:'https://attacker.example'},body:'{}'})).status,403)
  const rebound = await new Promise((resolve,reject)=>{const req=httpRequest(origin+'/api/github/start',{method:'POST',headers:{...headers,Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end('{}')})
  assert.equal(rebound,403)
  assert.equal((await fetch(origin+'/api/github/start',{method:'POST',headers:{...headers,'Content-Type':'application/x-www-form-urlencoded'},body:'x=y'})).status,403)
  assert.equal((await fetch(origin+'/api/unknown',{method:'POST',headers,body:'{}'})).status,404)
})
