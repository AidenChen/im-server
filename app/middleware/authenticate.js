const Kamora = require('kamora')
const jwt = require('jsonwebtoken')
const error = require('../../config/error')
const jwtConfig = require('../../config/jwt')

const User = Kamora.Database.model('user')

module.exports = async (ctx, next) => {
  const token = ctx.get('Authorization')
  if (!token) {
    throw new Kamora.Error(error.name.MISSING_TOKEN)
  }

  try {
    const decoded = await jwt.verify(token, jwtConfig.secret)

    const user = await User
      .findById(decoded.uid)
      .catch(() => {
        throw new Kamora.Error(error.name.INTERNAL_SERVER_ERROR)
      })

    ctx.filter = ctx.filter || {}
    ctx.filter.user = user
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new Kamora.Error(error.name.EXPIRED_TOKEN)
    }
    throw new Kamora.Error(error.name.INVALID_TOKEN)
  }

  await next()
}