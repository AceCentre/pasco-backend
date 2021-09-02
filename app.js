const createError = require('http-errors')
const express = require('express')
const path = require('path')
const logger = require('morgan')
const cors = require('cors')

const indexRouter = require('./routes/index')

const app = express()

const TRUSTED_ORIGIN = (process.env.TRUSTED_ORIGIN||'').split(' ')

if (TRUSTED_ORIGIN) {
  app.use(cors({
    origin: function (origin, callback) {
      if (!origin || TRUSTED_ORIGIN.indexOf(origin) != -1) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    }
  }))
}

app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

app.use('/', indexRouter)

// 404 error handler
app.use(function(err, req, res, next) {
  res.status(404)
  res.end('Not found: ' + req.url)
})

module.exports = app