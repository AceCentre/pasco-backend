const express = require('express')
const router = express.Router()
const qs = require('querystring')
const https = require('https')

let { DROPBOX_APP_KEY, DROPBOX_APP_SECRET, API_URL, 
      ALLOWED_REDIRECT_URLS } = process.env

ALLOWED_REDIRECT_URLS = ALLOWED_REDIRECT_URLS.split(' ')

function simple_http_post (url, body, headers) {
  return new Promise((resolve, reject) => {
    let bodybuff = Buffer.from(qs.stringify(body))
    let req = https.request(url, {
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': bodybuff.length,
      }, headers),
    }, (res) => {
      let output = { statusCode: res.statusCode, headers: res.headers }
      let data = []
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        data.push(chunk)
      })
      res.on('error', (err) => {
        reject(err)
      })
      res.on('close', () => {
        output.body = data.join('')
        resolve(output)
      })
      res.resume()
    })
    req.on('error', (err) => {
      reject(err)
    })
    req.write(bodybuff)
    req.end()
  })
}

/*
 * Security of oauth authorization and token request are restricted to
 *  /dropbox-oauth-return url, So we can make sure other apps are not able using
 *  the authorization methods.
 *  state.redirect_uri is restricted to APP_URL and APP_IOS_URL
 */
router.get('/dropbox-oauth-return', (req, res) => {
  try {
    if (!req.query.state || !req.query.code) {
      throw { status_code: 422, message: 'Invalid input, Expected state and code in request query' }
    }
    let state
    try {
      state = JSON.parse(req.query.state)
      if (!state) {
        throw new Error()
      }
    } catch (err) {
      throw { status_code: 422, message: 'Input state is not a json string' }
    }
    let redirect_uri = state.redirect_uri+''
    if (ALLOWED_REDIRECT_URLS.filter((a) => redirect_uri.startsWith(a)).length == 0) {
      throw { status_code: 403, message: 'Restricted state.redirect_uri' }
    }
    let redirect_uri_hash_idx = redirect_uri.indexOf('#')
    let redirect_uri_hash = ''
    if (redirect_uri_hash_idx != -1) {
      redirect_uri = redirect_uri.substring(0, redirect_uri_hash_idx)
      redirect_uri_hash = redirect_uri.substring(redirect_uri_hash_idx)
    }
    let rquery = Object.assign({}, req.query)
    res.redirect(redirect_uri + (redirect_uri.indexOf('?') == -1 ? '?' : '&') + qs.stringify(rquery) + redirect_uri_hash)
  } catch (err) {
    let error = !err.status_code ? { status_code: 500, message: 'Internal error' } : err
    if (!err.status_code) {
      console.error('dropbox-oauth-return error', err)
    }
    res.status(error.status_code).json({ error })
  }
})

router.post('/dropbox-oauth-token', async (req, res) => {
  try {
    let headers = {
      'Authorization': 'Basic ' + Buffer.from(DROPBOX_APP_KEY + ':' + DROPBOX_APP_SECRET).toString('base64'),
    }
    let body = { grant_type: req.body.grant_type }
    if (body.grant_type == 'authorization_code') {
      if (!req.body.code) {
        throw { status_code: 422, message: 'code is not defined' }
      }
      body.redirect_uri = `${API_URL}/dropbox-oauth-return`
      body.code = req.body.code
    } else if (body.grant_type == 'refresh_token') {
      if (!req.body.refresh_token) {
        throw { status_code: 422, message: 'refresh_token is not defined' }
      }
      body.refresh_token = req.body.refresh_token
    } else {
      throw { status_code: 422, message: 'grant_type is not defined' }
    }
    let resp = await simple_http_post('https://api.dropbox.com/oauth2/token', body, headers)
    let data = JSON.parse(resp.body)
    res.status(200).json({ status_code: resp.statusCode, data })
  } catch (err) {
    console.warn(err)
    let error = !err.status_code ? { status_code: 500, message: 'Internal error' } : err
    res.status(error.status_code).json({ error })
  }
})

module.exports = router
