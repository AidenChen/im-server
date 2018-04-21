const Kamora = require('kamora')
const error = require('../../config/error')

const Conversation = Kamora.Database.model('conversation')
const User = Kamora.Database.model('user')
const redis = Kamora.redis

exports.sendMessage = async (io, payloads) => {
  const conversationId = payloads[0].conversation_id

  const conversation = await Conversation
    .findById(conversationId)
    .catch(() => {
      throw new Kamora.Error(error.name.INTERNAL_SERVER_ERROR)
    })

  const members = await User
    .find({ 'username': { $in: conversation.members } })
    .catch(() => {
      throw new Kamora.Error(error.name.INTERNAL_SERVER_ERROR)
    })

  payloads = payloads.map((payload) => {
    payload.timestamp = Date.now()
    return payload
  })

  members.forEach((member) => {
    if (member.is_online && member.socket_id) {
      io
        .to(member.socket_id)
        .emit('message', payloads)
    } else {
      const serialPayloads = payloads.map((payload) => {
        return JSON.stringify(payload)
      })
      redis.rpush(`message:${member.id}`, ...serialPayloads)
    }
  })
}

exports.sendOfflineMessage = async (io, userId) => {
  let redisKey = `message:${userId}`
  let queue = await redis.lrange(redisKey, 0, -1)
  if (!queue.length) {
    return
  }

  let payloads = queue.map((item) => {
    return JSON.parse(item)
  })

  let payloadsDict = new Map()
  for (let i = 0; i < payloads.length; i++) {
    let payload = payloads[i]
    let conversationId = payload.conversation_id

    if (payloadsDict.get(conversationId)) {
      payloadsDict.get(conversationId).push(payload)
    } else {
      payloadsDict.set(conversationId, [payload])
    }
  }

  for (let value of payloadsDict.values()) {
    io
      .emit('message', value)
  }
}